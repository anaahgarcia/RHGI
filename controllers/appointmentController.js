const { google } = require('googleapis');
const { Appointment } = require('../models/appointmentModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

// Google Calendar API setup
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const AppointmentController = {
    // Create new appointment
    createAppointment: async (req, res) => {
        console.log("POST: /api/appointments - " + JSON.stringify(req.body));
        try {
            const {
                titulo,
                descricao,
                data,
                horario,
                participantes,
                tipo,
                local
            } = req.body;

            // Basic validation
            if (!titulo || !data || !horario) {
                return res.status(400).json({
                    error: "Campos obrigatórios: título, data e horário"
                });
            }

            // Create appointment in MongoDB
            const appointment = new Appointment({
                titulo,
                descricao,
                data,
                horario,
                participantes: participantes || [],
                tipo,
                local,
                status: 'pendente',
                organizador: req.user._id,
                historico: [{
                    tipo: 'criacao',
                    data: new Date(),
                    autor: req.user._id
                }]
            });

            // Create Google Calendar event
            const event = {
                summary: titulo,
                description: descricao,
                start: {
                    dateTime: `${data}T${horario}`,
                    timeZone: 'Europe/Lisbon',
                },
                end: {
                    dateTime: `${data}T${horario}`,
                    timeZone: 'Europe/Lisbon',
                },
                location: local,
                attendees: participantes.map(p => ({ email: p })),
                reminders: {
                    useDefault: true
                }
            };

            const calendarEvent = await calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                sendUpdates: 'all'
            });

            // Save Google Calendar Event ID
            appointment.googleCalendarEventId = calendarEvent.data.id;
            const savedAppointment = await appointment.save();

            // Save to SQLite
            const sqliteQuery = `
                INSERT INTO compromissos (
                    id,
                    titulo,
                    data,
                    horario,
                    tipo,
                    status,
                    organizador_id,
                    google_calendar_id,
                    criado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    savedAppointment._id.toString(),
                    titulo,
                    data,
                    horario,
                    tipo,
                    'pendente',
                    req.user._id.toString(),
                    calendarEvent.data.id,
                    new Date().toISOString()
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.status(201).json(savedAppointment);
        } catch (error) {
            console.error("Error creating appointment:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Get all appointments
    getAppointments: async (req, res) => {
        console.log("GET: /api/appointments");
        try {
            // Todos podem ver todos os compromissos
            const appointments = await Appointment.find()
                .populate('organizador', 'nome email')
                .populate('participantes', 'nome email')
                .sort({ data: 1, horario: 1 });

            res.json(appointments);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Update appointment
    updateAppointment: async (req, res) => {
        const appointmentId = req.params.id;
        console.log(`PUT: /api/appointments/${appointmentId}`);
        try {
            const appointment = await Appointment.findById(appointmentId);
            if (!appointment) {
                return res.status(404).json({ error: 'Compromisso não encontrado' });
            }

            // Apenas o organizador pode atualizar o compromisso
            if (appointment.organizador.toString() !== req.user._id.toString()) {
                return res.status(403).json({ error: 'Apenas o organizador pode atualizar o compromisso' });
            }

            // Update fields
            const updates = req.body;
            Object.keys(updates).forEach(key => {
                if (key !== 'historico' && key !== 'googleCalendarEventId') {
                    appointment[key] = updates[key];
                }
            });

            // Update Google Calendar event
            if (appointment.googleCalendarEventId) {
                const event = {
                    summary: appointment.titulo,
                    description: appointment.descricao,
                    start: {
                        dateTime: `${appointment.data}T${appointment.horario}`,
                        timeZone: 'Europe/Lisbon',
                    },
                    end: {
                        dateTime: `${appointment.data}T${appointment.horario}`,
                        timeZone: 'Europe/Lisbon',
                    },
                    location: appointment.local,
                    attendees: appointment.participantes.map(p => ({ email: p }))
                };

                await calendar.events.update({
                    calendarId: 'primary',
                    eventId: appointment.googleCalendarEventId,
                    resource: event,
                    sendUpdates: 'all'
                });
            }

            await appointment.save();

            // Update SQLite
            const sqliteQuery = `
                UPDATE compromissos
                SET titulo = ?,
                    data = ?,
                    horario = ?,
                    tipo = ?,
                    status = ?,
                    atualizado_em = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    appointment.titulo,
                    appointment.data,
                    appointment.horario,
                    appointment.tipo,
                    appointment.status,
                    new Date().toISOString(),
                    appointmentId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json(appointment);
        } catch (error) {
            console.error("Error updating appointment:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Cancel appointment
    cancelAppointment: async (req, res) => {
        const appointmentId = req.params.id;
        console.log(`PUT: /api/appointments/${appointmentId}/cancel`);
        try {
            const appointment = await Appointment.findById(appointmentId);
            if (!appointment) {
                return res.status(404).json({ error: 'Compromisso não encontrado' });
            }

            // Apenas o organizador pode cancelar o compromisso
            if (appointment.organizador.toString() !== req.user._id.toString()) {
                return res.status(403).json({ error: 'Apenas o organizador pode cancelar o compromisso' });
            }

            // Cancel in Google Calendar
            if (appointment.googleCalendarEventId) {
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: appointment.googleCalendarEventId,
                    sendUpdates: 'all'
                });
            }

            appointment.status = 'cancelado';
            await appointment.save();

            // Update SQLite
            const sqliteQuery = `
                UPDATE compromissos
                SET status = 'cancelado',
                    cancelado_em = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    new Date().toISOString(),
                    appointmentId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            res.json({ message: 'Compromisso cancelado com sucesso' });
        } catch (error) {
            console.error("Error canceling appointment:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = AppointmentController;