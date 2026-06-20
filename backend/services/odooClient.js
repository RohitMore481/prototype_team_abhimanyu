const fs = require('fs');
const path = require('path');

class OdooClient {
  constructor() {
    this.mockDir = path.join(__dirname, '..', '..', 'mock-odoo');
  }

  async getProjects() {
    const filePath = path.join(this.mockDir, 'projects.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  async getAssemblies() {
    const filePath = path.join(this.mockDir, 'assemblies.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  async getSubAssemblies() {
    const filePath = path.join(this.mockDir, 'subassemblies.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  async getComponents() {
    const filePath = path.join(this.mockDir, 'components.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  async getDependencies() {
    const filePath = path.join(this.mockDir, 'dependencies.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }
}

module.exports = new OdooClient();
