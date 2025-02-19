const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const sharp = require('sharp');
const { User } = require('../models/userModel');
const { Agency } = require('../models/agencyModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRdatabase.db');
const mongoose = require('mongoose');
const { SECRET_KEY } = require('../middleware');


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
        const db = new sqlite3.Database('HRdatabase.db');
        let transaction = false;
        let user;

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
                brokerEquipaId,
                telefone
            } = req.body;

            const existingUser = await User.findOne({
                $or: [
                    { username },
                    { email }
                ]
            });

            if (existingUser) {
                return res.status(400).json({
                    error: 'Username ou email já está em uso'
                });
            }

            // Iniciar transação SQLite
            await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            transaction = true;

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

            // Validar permissões baseado na role do usuário que está criando
            if (!req.user) {
                return res.status(403).json({ error: 'Permissão negada' });
            }

            // Restrições por role do usuário criador
            switch (req.user.role) {
                case 'Admin':
                    // Admin pode criar qualquer tipo de usuário
                    break;
                case 'Manager':
                    // Manager não pode criar Admin
                    if (role === 'Admin') {
                        return res.status(403).json({ error: 'Manager não pode criar Admin' });
                    }
                    break;
                case 'Consultor':
                    // Consultor só pode criar outros Consultores
                    if (role !== 'Consultor') {
                        return res.status(403).json({ error: 'Consultor só pode criar outros Consultores' });
                    }
                    // Associar automaticamente ao manager, diretor e broker do consultor criador
                    const consultorCriador = await User.findById(req.user.id).populate('responsavelId');
                    responsavelId = consultorCriador.responsavelId;
                    brokerEquipaId = consultorCriador.brokerEquipaId;
                    break;
                case 'Employee':
                case 'Recrutador':
                    // Não podem criar Admin, Manager ou Diretores
                    if (['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial',
                        'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações',
                        'Diretor Financeiro', 'Diretor Jurídico'].includes(role)) {
                        return res.status(403).json({ error: 'Sem permissão para criar esta função' });
                    }
                    break;
                default:
                    // Outros usuários não podem criar Admin ou Manager
                    if (['Admin', 'Manager'].includes(role)) {
                        return res.status(403).json({ error: 'Sem permissão para criar Admin ou Manager' });
                    }
            }

            // Verificar se precisa de responsável associado
            if (!['Admin', 'Manager'].includes(role) && !responsavelId) {
                return res.status(400).json({ error: 'Usuários precisam de um responsável associado' });
            }

            // Criar ID que será usado em ambos os bancos
            const userId = new mongoose.Types.ObjectId();

            // Criar no MongoDB primeiro
            user = new User({
                _id: userId,
                username,
                password, // Senha em plain text no MongoDB
                nome,
                email,
                telefone,
                role,
                departamento,
                agencias,
                responsavelId,
                brokerEquipaId,
                status: 'ativo'

            });

            await user.save();

            // Encriptar senha para o SQLite
            const hashedPassword = await bcrypt.hash(password, 10);

            // Inserir no SQLite
            const sqliteQuery = `
                INSERT INTO usuarios (
                    id,
                    username,
                    password,
                    nome,
                    email,
                    telefone,
                    role,
                    departamento,
                    status,
                    criado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    userId.toString(),
                    username,
                    hashedPassword,
                    nome,
                    email,
                    telefone || null,
                    role,
                    departamento || null,
                    'ativo'
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Commit da transação
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });

            res.status(201).json({
                message: 'Usuário criado com sucesso',
                user: {
                    id: user._id,
                    nome: user.nome,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('Erro ao criar usuário:', error);

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
                { id: user._id, role: user.role },
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

    getUsuarios: async (req, res) => {
        console.log("GET: /api/users - Query:", req.query);
        console.log(`Usuário autenticado: ${req.user.role} (ID: ${req.user._id})`);

        try {
            let query = { status: 'ativo' };

            // ❌ Nenhum usuário pode ver Admins, exceto o próprio Admin
            if (req.user.role !== 'Admin') {
                query.role = { $ne: 'Admin' };
            }

            let usuarios;

            if (req.user.role === 'Admin') {
                console.log("Admin - Acesso total.");
                // 🔹 Admin vê tudo (exceto senhas)
                usuarios = await User.find(query)
                    .populate('agencias.agenciaId')
                    .populate('responsavelId')
                    .select('-password');
            } else if (req.user.role === 'Manager') {
                console.log("Manager - Pode ver tudo, exceto Admins.");
                // 🔹 Manager vê tudo, menos Admins
                usuarios = await User.find(query)
                    .populate('agencias.agenciaId')
                    .populate('responsavelId')
                    .select('-password');
            } else if (req.user.role.startsWith('Diretor')) {
                console.log("Diretor - Pode ver tudo dos subordinados diretos, o resto apenas nome, telefone e email.");

                // 🔹 Primeiro, obter todos os usuários subordinados diretamente ao diretor
                const subordinados = await User.find({ responsavelId: req.user._id }).select('_id');

                // Criar um array com os IDs dos subordinados diretos
                const subordinadoIds = subordinados.map(user => user._id.toString());

                // 🔹 Verificação: Se o usuário for subordinado, retorna todos os dados; caso contrário, retorna informações básicas
                usuarios = await User.find(query)
                    .populate('agencias.agenciaId')
                    .populate('responsavelId')
                    .select(subordinadoIds.includes(req.user._id.toString()) ? '-password' : 'nome email telefone photo role');
            } else if (req.user.role === 'Broker de Equipa') {
                console.log("Broker de Equipa - Pode ver usuários da sua equipe.");
                // 🔹 Broker de Equipa pode ver todos os dados de usuários que tenham o mesmo brokerEquipaId
                query.brokerEquipaId = req.user._id;
                usuarios = await User.find(query)
                    .populate('agencias.agenciaId')
                    .populate('responsavelId')
                    .select('-password');
            } else {
                console.log("Funcionário comum - Pode listar usuários, mas verá apenas nome, email e telefone.");
                // 🔹 Funcionários comuns podem ver apenas nome, email e telefone
                usuarios = await User.find(query)
                    .select('nome email telefone photo');
            }

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

            // Determinar nível de acesso
            if (['Admin', 'Manager'].includes(req.user.role) ||
                req.user.role.startsWith('Diretor') ||
                req.user.role === 'Broker de Equipa') {
                // Usuários com permissão especial veem tudo
                user = await User.findById(userId)
                    .populate('agencias.agenciaId')
                    .populate('responsavelId')
                    .select('-password -photo');
            } else {
                // Outros usuários veem apenas informações básicas
                user = await User.findById(userId)
                    .select('nome email telefone');
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
                password, // Senha em plain text para MongoDB
                nome,
                email,
                telefone,
                role: 'Admin', // ✅ Valor fixo para Admin
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

            // 🔒 Verificar permissões para alteração de senha
            if (updates.password) {
                if (req.user._id.toString() !== userId && !['Admin', 'Manager'].includes(req.user.role)) {
                    return res.status(403).json({ error: 'Você não tem permissão para alterar a senha de outro usuário.' });
                }

                console.log(`🔑 Atualizando senha do usuário ${user.nome}`);

                // Senha fica **em texto puro** no MongoDB
                user.password = updates.password;

                // Senha **é encriptada** no SQLite antes de salvar
                updates.password = await bcrypt.hash(updates.password, 10);
            }

            // 🔒 Verificar permissões para alteração de role
            if (updates.role) {
                if (updates.role === 'Admin' && req.user.role !== 'Admin') {
                    return res.status(403).json({ error: 'Apenas o Admin pode atribuir a role de Admin.' });
                }

                if (updates.role === 'Manager' && !['Admin', 'Manager'].includes(req.user.role)) {
                    return res.status(403).json({ error: 'Apenas Admins e Managers podem atribuir a role de Manager.' });
                }

                if (['Diretor de RH', 'Diretor Comercial', 'Diretor de Marketing',
                    'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro',
                    'Diretor Jurídico'].includes(updates.role) &&
                    !['Admin', 'Manager', 'Recrutador'].includes(req.user.role)) {
                    return res.status(403).json({ error: 'Apenas Admins, Managers e Recrutadores podem atribuir essas funções.' });
                }

                if (!['Admin', 'Manager', 'Recrutador'].includes(req.user.role)) {
                    return res.status(403).json({ error: 'Você não tem permissão para alterar roles.' });
                }
            }

            // Criar histórico da atualização
            const historicoAtualizacao = Object.keys(updates).map(campo => ({
                tipo: "atualizacao",
                campo: campo,
                valorAntigo: user[campo] || null,
                valorNovo: updates[campo],
                data: new Date(),
                autor: req.user && req.user._id || null
            }));


            // Atualizar os dados do usuário no MongoDB
            Object.keys(updates).forEach(key => {
                if (key !== 'photo') {
                    user[key] = updates[key];
                }
            });


            // Adicionar novo histórico
            if (!user.historico) {
                user.historico = [];
            }

            user.historico = user.historico.concat(historicoAtualizacao);



            console.log("📜 Histórico corrigido antes de salvar:", JSON.stringify(user.historico, null, 2));

            await user.save();

            // Atualizar SQLite
            const sqliteQuery = `
                UPDATE usuarios 
                SET nome = ?,
                    email = ?,
                    telefone = ?,
                    departamento = ?,
                    role = ?,
                    password = ?,
                    atualizado_em = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    user.nome,
                    user.email,
                    user.telefone,
                    user.departamento || null,
                    user.role,
                    updates.password || user.password, // ✅ Salva senha encriptada no SQLite
                    new Date().toISOString(),
                    userId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`✅ Sucesso: Usuário ${user.nome} atualizado`);
            res.json({ message: 'Usuário atualizado com sucesso', user });

        } catch (error) {
            console.error("❌ Erro ao atualizar usuário:", error);
            res.status(500).json({ error: error.message });
        }
    },
};

module.exports = { UserController, upload };