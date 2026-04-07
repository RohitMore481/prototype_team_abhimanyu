// services/alertService.js
const supabase = require('../supabaseClient');

// Create a new alert
async function createAlert(alertData) {
  const { data, error } = await supabase
    .from('alerts')
    .insert([alertData])
    .select();
  if (error) throw error;
  return data[0];
}

// Get all alerts
async function getAlerts() {
  const { data, error } = await supabase
    .from('alerts')
    .select('*');
  if (error) throw error;
  return data;
}

// Resolve an alert
async function resolveAlert(alertId) {
  const { data, error } = await supabase
    .from('alerts')
    .update({ resolved: true })
    .eq('id', alertId)
    .select();
  if (error) throw error;
  return data[0];
}

module.exports = { createAlert, getAlerts, resolveAlert };