const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const sharp = require('sharp');
const { User } = require('../models/userModel');
const { Agency } = require('../models/agencyModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRdatabase.db');

// Configuração do multer para upload de fotos
const upload = multer({
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/)) {
            return cb(new Error('Por favor, envie apenas arquivos de imagem'));
        }
        cb(undefined, true);
    }
});

const UserController = {
    // Registro de novo usuário
    registerUser: async (req, res) => {
        try {
            const {
                username,
                password,
                nome,
                email,
                role,
                departamento,
                agencias,
                responsavelId,
                brokerEquipaId
            } = req.body;

            // Validar roles permitidas
            const rolesValidas = [
                'Admin',
                'Manager',
                'Diretor de RH',
                'Diretor Comercial',
                'Diretor de Marketing',
                'Diretor de Crédito',
                'Diretor de Remodelações',
                'Diretor Financeiro',
                'Diretor Jurídico',
                'Recrutador',
                'Broker de Equipa',
                'Consultor',
                'Employee'
            ];

            if (!rolesValidas.includes(role)) {
                return res.status(400).json({ error: 'Função inválida' });
            }

            // Validar permissões para criar usuários
            if (req.user.role === 'Consultor' || req.user.role === 'Employee') {
                return res.status(403).json({ error: 'Sem permissão para criar usuários' });
            }

            // Se não for Admin ou Manager, não pode criar Admin ou Manager
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
                if (role === 'Admin' || role === 'Manager') {
                    return res.status(403).json({ error: 'Sem permissão para criar Admin ou Manager' });
                }
            }

            // Criar usuário no MongoDB
            const user = new User({
                username,
                password: await bcrypt.hash(password, 10),
                nome,
                email,
                role,
                departamento,
                agencias,
                responsavelId,
                brokerEquipaId,
                status: 'ativo',
                criadoPor: req.user._id
            });

            await user.save();

            // Salvar no SQLite
            const sqliteQuery = `
                INSERT INTO usuarios (
                    id, username, nome, email, role, departamento, status, criado_em, criado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    user._id.toString(),
                    username,
                    nome,
                    email,
                    role,
                    departamento,
                    'ativo',
                    new Date().toISOString(),
                    req.user._id.toString()
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.status(201).json({ 
                message: 'Usuário criado com sucesso', 
                user 
            });

        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Login
    login: async (req, res) => {
        try {
            const { username, password } = req.body;
            const user = await User.findOne({ 
                username, 
                status: 'ativo' 
            });

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ 
                    error: 'Credenciais inválidas' 
                });
            }

            const token = jwt.sign(
                { userId: user._id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Registrar login no SQLite
            const sqliteQuery = `
                INSERT INTO logs_acesso (
                    usuario_id, tipo_acao, data_hora, ip
                ) VALUES (?, ?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    user._id.toString(),
                    'login',
                    new Date().toISOString(),
                    req.ip
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.status(200).json({ 
                token, 
                user: {
                    id: user._id,
                    nome: user.nome,
                    role: user.role,
                    departamento: user.departamento,
                    agencias: user.agencias
                }
            });

        } catch (error) {
            console.error('Erro no login:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Inativar usuário
    inativarUsuario: async (req, res) => {
        try {
            const userToInactivate = await User.findById(req.params.id);
            
            if (!userToInactivate) {
                return res.status(404).json({ 
                    error: 'Usuário não encontrado' 
                });
            }

            // Verificar permissões
            if (req.user.role !== 'Admin') {
                if (req.user.role === 'Manager' && userToInactivate.role === 'Admin') {
                    return res.status(403).json({ 
                        error: 'Managers não podem inativar Admins' 
                    });
                }

                if (req.user.role.startsWith('Diretor')) {
                    if (['Admin', 'Manager'].includes(userToInactivate.role) || 
                        userToInactivate.departamento !== req.user.departamento) {
                        return res.status(403).json({ 
                            error: 'Sem permissão para inativar este usuário' 
                        });
                    }
                }
            }

            // Atualizar no MongoDB
            userToInactivate.status = 'inativo';
            userToInactivate.inativadoEm = new Date();
            userToInactivate.inativadoPor = req.user._id;
            await userToInactivate.save();

            // Atualizar no SQLite
            const sqliteQuery = `
                UPDATE usuarios 
                SET status = ?, 
                    inativado_em = ?, 
                    inativado_por = ? 
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    'inativo',
                    new Date().toISOString(),
                    req.user._id.toString(),
                    userToInactivate._id.toString()
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ message: 'Usuário inativado com sucesso' });

        } catch (error) {
            console.error('Erro ao inativar usuário:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Buscar usuários com base em permissões
    getUsuarios: async (req, res) => {
        try {
            let query = { status: 'ativo' };
            let usuarios;

            // Filtrar com base na role
            switch(req.user.role) {
                case 'Admin':
                case 'Manager':
                    // Podem ver todos os usuários
                    break;

                case 'Diretor de RH':
                case 'Diretor Comercial':
                case 'Diretor de Marketing':
                case 'Diretor de Crédito':
                case 'Diretor de Remodelações':
                case 'Diretor Financeiro':
                case 'Diretor Jurídico':
                    // Podem ver apenas usuários do seu departamento
                    query.departamento = req.user.departamento;
                    break;

                case 'Broker de Equipa':
                    // Podem ver sua equipe
                    query.brokerEquipaId = req.user._id;
                    break;

                case 'Recrutador':
                case 'Employee':
                    // Podem ver apenas próprios dados
                    query._id = req.user._id;
                    break;

                case 'Consultor':
                    // Acesso limitado
                    return res.status(403).json({ 
                        error: 'Sem permissão para acessar lista de usuários' 
                    });
            }

            usuarios = await User.find(query)
                .populate('agencias.agenciaId')
                .populate('responsavelId')
                .select('-password -photo');

            res.json(usuarios);

        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Atualizar foto do usuário
    atualizarFoto: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ 
                    error: 'Nenhuma foto enviada' 
                });
            }

            const buffer = await sharp(req.file.buffer)
                .resize({ width: 800, height: 800, fit: 'inside' })
                .webp({ quality: 80 })
                .toBuffer();

            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ 
                    error: 'Usuário não encontrado' 
                });
            }

            // Verificar permissões
            if (req.user.role !== 'Admin' && 
                req.user.role !== 'Manager' && 
                req.user._id.toString() !== req.params.id) {
                return res.status(403).json({ 
                    error: 'Sem permissão' 
                });
            }

            user.photo = {
                data: buffer,
                contentType: 'image/webp',
                uploadedAt: new Date()
            };

            await user.save();

            // Registrar atualização no SQLite
            const sqliteQuery = `
                INSERT INTO historico_fotos (
                    usuario_id, 
                    atualizado_em, 
                    atualizado_por
                ) VALUES (?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    user._id.toString(),
                    new Date().toISOString(),
                    req.user._id.toString()
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ message: 'Foto atualizada com sucesso' });

        } catch (error) {
            console.error('Erro ao atualizar foto:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Logout
    logout: async (req, res) => {
        try {
            // Registrar logout no SQLite
            const sqliteQuery = `
                INSERT INTO logs_acesso (
                    usuario_id, tipo_acao, data_hora, ip
                ) VALUES (?, ?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    req.user._id.toString(),
                    'logout',
                    new Date().toISOString(),
                    req.ip
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.clearCookie('token');
            res.status(200).json({ message: 'Logout realizado com sucesso' });

        } catch (error) {
            console.error('Erro ao realizar logout:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = userController;