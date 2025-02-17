// departmentController.js
const { Department } = require('../models/departmentModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

const DepartmentController = {
    // POST: /api/departments
    // Body: {
    //   "nome": "string",
    //   "manager": "userId",
    //   "agencias": ["agencyId"]
    // }
    createDepartment: async (req, res) => {
        console.log("POST: /api/departments - " + JSON.stringify(req.body));
        try {
            const { nome, manager, agencias } = req.body;

            const department = new Department({
                nome,
                manager,
                agencias
            });

            const savedDepartment = await department.save();

            // Registrar no SQLite
            const sqliteQuery = `
                INSERT INTO departamentos (
                    id,
                    nome,
                    manager_id
                ) VALUES (?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    savedDepartment._id.toString(),
                    nome,
                    manager
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Department ${nome} created successfully`);
            res.status(201).json(savedDepartment);
        } catch (error) {
            console.error("Error creating department:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET: /api/departments
    // Headers: Authorization: Bearer {token}
    getDepartments: async (req, res) => {
        console.log("GET: /api/departments");
        try {
            const departments = await Department.find()
                .populate('manager', 'nome')
                .populate('agencias', 'nome');

            console.log(`Success: Retrieved ${departments.length} departments`);
            res.json(departments);
        } catch (error) {
            console.error("Error fetching departments:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // PUT: /api/departments/:id
    // Headers: Authorization: Bearer {token}
    // Body: {
    //   "nome": "string",
    //   "manager": "userId",
    //   "agencias": ["agencyId"]
    // }
    updateDepartment: async (req, res) => {
        const departmentId = req.params.id;
        console.log(`PUT: /api/departments/${departmentId} - ${JSON.stringify(req.body)}`);
        try {
            const department = await Department.findByIdAndUpdate(
                departmentId,
                req.body,
                { new: true }
            ).populate('manager', 'nome')
             .populate('agencias', 'nome');

            if (!department) {
                console.log(`Error: Department with ID ${departmentId} not found`);
                return res.status(404).json({ error: 'Departamento não encontrado' });
            }

            // Atualizar SQLite
            const sqliteQuery = `
                UPDATE departamentos 
                SET nome = ?,
                    manager_id = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    department.nome,
                    department.manager._id.toString(),
                    departmentId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Department ${department.nome} updated successfully`);
            res.json(department);
        } catch (error) {
            console.error("Error updating department:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE: /api/departments/:id
    // Headers: Authorization: Bearer {token}
    inactivateDepartment: async (req, res) => {
        const departmentId = req.params.id;
        console.log(`DELETE: /api/departments/${departmentId}`);
        try {
            const department = await Department.findByIdAndUpdate(
                departmentId,
                { status: 'inativo' },
                { new: true }
            );

            if (!department) {
                console.log(`Error: Department with ID ${departmentId} not found`);
                return res.status(404).json({ error: 'Departamento não encontrado' });
            }

            // Atualizar SQLite
            const sqliteQuery = `
                UPDATE departamentos 
                SET status = 'inativo'
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [departmentId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Department ${department.nome} inactivated successfully`);
            res.json({ message: 'Departamento inativado com sucesso' });
        } catch (error) {
            console.error("Error inactivating department:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = DepartmentController;

