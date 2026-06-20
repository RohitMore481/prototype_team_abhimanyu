const odooClient = require('./odooClient');
const db = require('../db');

class ProjectImportService {
  async sync() {
    try {
      // 1. Fetch all datasets from Odoo client
      const odooProjects = await odooClient.getProjects();
      const odooAssemblies = await odooClient.getAssemblies();
      const odooSubAssemblies = await odooClient.getSubAssemblies();
      const odooComponents = await odooClient.getComponents();
      const odooDependencies = await odooClient.getDependencies();

      // 2. Perform DB operations inside a secure SQLite transaction
      const syncTransaction = db.transaction(() => {
        for (const op of odooProjects) {
          // A. Sync Project metadata
          const existing = db.prepare('SELECT id FROM projects WHERE odoo_id = ?').get(op.id);
          let projectId;
          
          if (existing) {
            projectId = existing.id;
            db.prepare(`
              UPDATE projects 
              SET name = ?, description = ?, odoo_status = ?, customer = ?, deadline = ? 
              WHERE id = ?
            `).run(op.name, op.description || '', op.status, op.customer, op.deadline, projectId);
          } else {
            const res = db.prepare(`
              INSERT INTO projects (name, description, odoo_id, odoo_status, customer, deadline) 
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(op.name, op.description || '', op.id, op.status, op.customer, op.deadline);
            projectId = Number(res.lastInsertRowid);
          }

          // B. Sync Assemblies for this project
          const projectAssemblies = odooAssemblies.filter(a => a.projectId === op.id);
          for (const oa of projectAssemblies) {
            db.prepare(`
              INSERT INTO assemblies (id, project_id, name, drawing_no)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                drawing_no = excluded.drawing_no
            `).run(oa.id, projectId, oa.name, oa.drawingNo);

            // C. Sync Sub-Assemblies for this assembly
            const assemblySubAssemblies = odooSubAssemblies.filter(s => s.assemblyId === oa.id);
            for (const osa of assemblySubAssemblies) {
              db.prepare(`
                INSERT INTO sub_assemblies (id, assembly_id, name, drawing_no, planned_hours, material_status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  drawing_no = excluded.drawing_no,
                  planned_hours = excluded.planned_hours,
                  material_status = excluded.material_status
              `).run(osa.id, oa.id, osa.name, osa.drawingNo, osa.plannedHours, osa.materialStatus);

              // D. Initialize Execution tracking state if it doesn't exist
              const executionExists = db.prepare('SELECT sub_assembly_id FROM sub_assembly_execution WHERE sub_assembly_id = ?').get(osa.id);
              if (!executionExists) {
                db.prepare(`
                  INSERT INTO sub_assembly_execution (sub_assembly_id, status, progress, delays, notes) 
                  VALUES (?, ?, ?, ?, ?)
                `).run(osa.id, 'pending', 0, '', '');
              }

              // E. Sync Components for this sub-assembly
              const subComponents = odooComponents.filter(c => c.subAssemblyId === osa.id);
              for (const oc of subComponents) {
                const ocStatus = (oc.status || 'pending').toLowerCase();
                const partNumber = oc.partNumber || `PN-${oc.id}-MTR`;
                const supplier = oc.supplier || "Industrial Supplies Co.";
                const reqQty = oc.requiredQuantity !== undefined ? oc.requiredQuantity : oc.quantity;
                const availQty = oc.availableQuantity !== undefined ? oc.availableQuantity : (ocStatus === 'arrived' ? oc.quantity : 0);
                const actualArrival = oc.actualArrival || (ocStatus === 'arrived' ? oc.expectedArrival : null);
                const inventoryStatus = ocStatus;

                db.prepare(`
                  INSERT INTO components (
                    id, sub_assembly_id, name, quantity, expected_arrival, status,
                    part_number, supplier, required_quantity, available_quantity, actual_arrival, inventory_status
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    quantity = excluded.quantity,
                    expected_arrival = excluded.expected_arrival,
                    status = excluded.status,
                    part_number = excluded.part_number,
                    supplier = excluded.supplier,
                    required_quantity = excluded.required_quantity,
                    available_quantity = excluded.available_quantity,
                    actual_arrival = excluded.actual_arrival,
                    inventory_status = excluded.inventory_status
                `).run(
                  oc.id, osa.id, oc.name, oc.quantity, oc.expectedArrival, ocStatus,
                  partNumber, supplier, reqQty, availQty, actualArrival, inventoryStatus
                );
              }
            }
          }
        }

        // F. Sync Odoo dependencies
        for (const dep of odooDependencies) {
          db.prepare(`
            INSERT OR IGNORE INTO odoo_dependencies (from_sub_assembly_id, to_sub_assembly_id)
            VALUES (?, ?)
          `).run(dep.from, dep.to);
        }
      });

      syncTransaction();
      console.log('Project sync with Odoo completed successfully.');
    } catch (err) {
      console.error('Error syncing projects with Odoo:', err);
      throw err;
    }
  }
}

module.exports = new ProjectImportService();
