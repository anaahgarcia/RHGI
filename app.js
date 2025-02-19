var cors = require('cors');
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mongoose = require('mongoose');
var sqlite3 = require('sqlite3').verbose();

// Rotas
var UserRoutes = require('./routes/userRoutes');
var AgencyRoutes = require('./routes/agencyRoutes');
var TaskRoutes = require('./routes/taskRoutes');
var CandidateRoutes = require('./routes/candidateRoutes');
var AppointmentRoutes = require('./routes/appointmentRoutes');
// Adicionar novas rotas
var CvAnalysisRoutes = require('./routes/cvAnalysisRoutes');
var DepartmentRoutes = require('./routes/departmentRoutes');
var ReportRoutes = require('./routes/reportRoutes');

var app = express();

// Configuração do CORS
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));

// Conexão com MongoDB
mongoose.set('strictQuery', true);
mongoose.connect('mongodb+srv://projetogirh:projetogirh@clusterprojetogi.dz6gs.mongodb.net/')
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Conexão com SQLite
const db = new sqlite3.Database('HRdatabase.db', (err) => {
    if (err) {
        console.error('SQLite connection error:', err);
    } else {
        console.log('SQLite connected successfully');
    }
});

var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api/users', UserRoutes);
app.use('/api/agencies', AgencyRoutes);
app.use('/api/tasks', TaskRoutes);
app.use('/api/candidates', CandidateRoutes);
app.use('/api/appointments', AppointmentRoutes);
app.use('/api/cvAnalysis', CvAnalysisRoutes);
app.use('/api/departments', DepartmentRoutes);
app.use('/api/reports', ReportRoutes);

// Tratamento de erros 404
app.use(function(req, res, next) {
    next(createError(404, "Resource not found"));
});

// Tratamento de erros global
app.use(function(err, req, res, next) {
    // Log do erro no SQLite
    db.run(`INSERT INTO error_logs (
        error_message,
        error_stack,
        date_time,
        user_id
    ) VALUES (?, ?, ?, ?)`, [
        err.message,
        err.stack,
        new Date().toISOString(),
        req.user ? req.user._id : null
    ]);

    res.status(err.status || 500);
    res.json({
        message: err.message,
        error: req.app.get('env') === 'development' ? err : {}
    });
});

var port = 8080;
app.listen(port, () => {
    console.log("App running on port " + port);
});

module.exports = app;