const crypto = require('crypto');

// Gera uma chave aleatória segura se não existir uma no ambiente
const generateKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Configurações de segurança
module.exports = {
  // Usa a variável de ambiente JWT_SECRET ou gera uma nova chave
  securekey: process.env.JWT_SECRET || generateKey(),
  
  // Tempo de expiração do token
  tokenExpiration: '24h',
  
  // Configurações adicionais de segurança
  jwtOptions: {
    algorithm: 'HS256',
    expiresIn: '24h'
  },
  
  // Configurações de cookies
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
};