const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const sharp = require('sharp');
const { User } = require('../models/userModel');
const { Agency } = require('../models/agencyModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRdatabase.db');
const mongoose = require('mongoose');

const securekey = "chave_super_secreta_do_jwt";


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

// Função para verificar permissões do usuário
const checkUserPermissions = async (requestingUser, targetUser) => {
    if (requestingUser.role === 'Admin' || requestingUser.role === 'Manager') {
        return true;
    }

    if (requestingUser.role.startsWith('Diretor')) {
        return targetUser.departamento === requestingUser.departamento;
    }

    if (requestingUser.role === 'Broker de Equipa') {
        return targetUser.brokerEquipaId.toString() === requestingUser._id.toString();
    }

    return requestingUser._id.toString() === targetUser._id.toString();
};

   // POST: /api/users/register
    // Body: {
    //   "username": "string",
    //   "password": "string",
    //   "nome": "string",
    //   "email": "string",
    //   "role": "string",
    //   "departamento": "string",
    //   "agencias": ["string"],
    //   "responsavelId": "string",
    //   "brokerEquipaId": "string"
    // }

const UserController = {
    // Registro de novo usuário
    registerUser: async (req, res) => {
        console.log("POST: /api/users/register - " + JSON.stringify(req.body));
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
    
            // Apenas Admin pode criar Managers e Admins
            if ((role === 'Manager' || role === 'Admin') && req.user.role !== 'Admin') {
                return res.status(403).json({ error: 'Apenas Admin pode criar Managers ou Admins' });
            }
    
            // Outros usuários podem criar qualquer role, exceto Admin e Manager
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
                if (role === 'Admin' || role === 'Manager') {
                    return res.status(403).json({ error: 'Sem permissão para criar Admin ou Manager' });
                }
            }
    
            // Se não for Admin ou Manager, garantir que tenha um responsável associado
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager' && !responsavelId) {
                return res.status(400).json({ error: 'Usuários precisam de um responsável associado' });
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

       // POST: /api/users/login
    // Body: {
    //   "username": "string",
    //   "password": "string"
    // }


    // Login
    login: async (req, res) => {
        console.log("POST: /api/login - " + JSON.stringify(req.body));
        try {
            const { username, password } = req.body;
            const user = await User.findOne({ 
                username, 
                status: 'ativo' 
            });
    
            if (!user) {
                return res.status(401).json({ 
                    error: 'Credenciais inválidas' 
                });
            }
    
            // Remover a comparação com bcrypt já que a senha no MongoDB está em plain text
            if (password !== user.password) {
                return res.status(401).json({ 
                    error: 'Credenciais inválidas' 
                });
            }
    
            const token = jwt.sign(
                { id: user._id.toString(), role: user.role },
                SECRET_KEY,
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

       // PUT: /api/users/:id/inactivate
    // Headers: Authorization: Bearer {token}
    // Body: {
    //   "motivo": "string"
    // }

    // Inativar usuário
    inativarUsuario: async (req, res) => {
        const userId = req.params.id;
        console.log(`PUT: /api/users/${userId}/inactivate - ${JSON.stringify(req.body)}`);
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

     // GET: /api/users
    // Headers: Authorization: Bearer {token}
    // Query Params: departamento, role, agencia, status

    // Buscar usuários com base em permissões
    getUsuarios: async (req, res) => {
        console.log("GET: /api/users - Query:", req.query);
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

        // GET: /api/users/:id
    // Headers: Authorization: Bearer {token}
    getUsuario: async (req, res) => {
        const userId = req.params.id;
        console.log(`GET: /api/users/${userId}`);
        try {
            const user = await User.findById(userId)
                .populate('agencias.agenciaId')
                .select('-password -photo');

            if (!user) {
                console.log(`Error: User with ID ${userId} not found`);
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            // Verificar permissões
            if (!await checkUserPermissions(req.user, user)) {
                return res.status(403).json({ error: 'Sem permissão para acessar este usuário' });
            }

            console.log(`Success: Retrieved user ${user.nome}`);
            res.json(user);
        } catch (error) {
            console.error("Error fetching user:", error);
            res.status(500).json({ error: error.message });
        }
    },

// Adicionar logo após a definição do UserController
createFirstAdmin: async (req, res) => {
    console.log("POST: /api/users/first-admin - " + JSON.stringify(req.body));
    
    const db = new sqlite3.Database('HRdatabase.db');
    let transaction = false;
    let user;
    
    try {
        // Verificar se já existe algum admin
        const adminExists = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM usuarios WHERE role = ?', ['Admin'], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (adminExists) {
            db.close();
            return res.status(400).json({ error: 'Já existe um admin no sistema' });
        }

        const { 
            username,
            password,
            nome,
            email,
            telefone
        } = req.body;

        // Gerar ID que será usado em ambos os bancos
        const userId = new mongoose.Types.ObjectId().toString();
        
        // Criar no MongoDB (campos essenciais apenas)
        user = new User({
            _id: userId,
            username,
            password, // Senha sem encriptação para o MongoDB
            nome,
            email,
            telefone,
            role: 'Admin',
            status: 'ativo'
        });

        await user.save();

        // Encriptar senha para o SQLite
        const hashedPassword = await bcrypt.hash(password, 10);

        // Iniciar transação SQLite
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        transaction = true;

        // Inserir no SQLite (campos essenciais apenas)
        const sqliteQuery = `
            INSERT INTO usuarios (
                id,
                username,
                password,
                nome,
                email,
                telefone,
                role,
                status,
                criado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

        await new Promise((resolve, reject) => {
            db.run(sqliteQuery, [
                userId,
                username,
                hashedPassword, // Senha encriptada para o SQLite
                nome,
                email,
                telefone || null,
                'Admin',
                'ativo'
            ], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                resolve();
            });
        });

        res.status(201).json({
            message: 'Primeiro admin criado com sucesso',
            user: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Erro ao criar primeiro admin:', error);
        
        if (transaction) {
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
        }

        if (user?._id) {
            try {
                await User.findByIdAndDelete(user._id);
            } catch (deleteError) {
                console.error('Erro ao deletar usuário do MongoDB:', deleteError);
            }
        }

        res.status(500).json({ error: error.message });
    } finally {
        db.close();
    }
},


       // PUT: /api/users/:id/photo
    // Headers: Authorization: Bearer {token}
    // Body: form-data { photo: File }

    // Atualizar foto do usuário
    atualizarFoto: [
        upload.single('photo'), // Adicionar middleware do multer
        async (req, res) => {
            const userId = req.params.id;
            console.log(`PUT: /api/users/${userId}/photo`);
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
        }
    ],

    // POST: /api/users/logout
    // Headers: Authorization: Bearer {token}

    // Logout
    logout: async (req, res) => {
        console.log("POST: /api/users/logout");
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
    },

    // PUT: /api/users/:id/update
    // Headers: Authorization: Bearer {token}
    // Body: {
    //   "nome": "string",
    //   "email": "string",
    //   "departamento": "string",
    //   "role": "string" (opcional, somente Admin/Manager)
    // }

    update: async (req, res) => {
        const userId = req.params.id;
        console.log(`PUT: /api/users/${userId} - ${JSON.stringify(req.body)}`);
        try {
            const updates = req.body;
            const user = await User.findById(userId);

            if (!user) {
                console.log(`Error: User with ID ${userId} not found`);
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }

            // Verificar permissões
            if (!await checkUserPermissions(req.user, user)) {
                return res.status(403).json({ error: 'Sem permissão para atualizar este usuário' });
            }

            // Apenas Admin e Manager podem atualizar role
            if (updates.role && !['Admin', 'Manager'].includes(req.user.role)) {
                delete updates.role;
            }

            Object.keys(updates).forEach(key => {
                if (key !== 'password' && key !== 'photo') {
                    user[key] = updates[key];
                }
            });

            await user.save();

            // Atualizar SQLite
            const sqliteQuery = `
                UPDATE usuarios 
                SET nome = ?,
                    email = ?,
                    departamento = ?,
                    role = ?,
                    atualizado_em = ?,
                    atualizado_por = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    user.nome,
                    user.email,
                    user.departamento,
                    user.role,
                    new Date().toISOString(),
                    req.user._id.toString(),
                    userId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: User ${user.nome} updated successfully`);
            res.json({ message: 'Usuário atualizado com sucesso', user });
        } catch (error) {
            console.error("Error updating user:", error);
            res.status(500).json({ error: error.message });
        }
    },

    
};

module.exports = { UserController, upload };