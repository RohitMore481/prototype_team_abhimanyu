// services/downtimeService.js
const supabase = require('../supabaseClient');

async function logDowntime(machineId, reason, startTime, endTime) {
  const { data, error } = await supabase
    .from('downtimes')
    .insert([{ machine_id: machineId, reason, start_time: startTime, end_time: endTime }])
    .select();
  if (error) throw error;
  return data[0];
}

async function getDowntimes(machineId) {
  const { data, error } = await supabase
    .from('downtimes')
    .select('*')
    .eq('machine_id', machineId);
  if (error) throw error;
  return data;
}

module.exports = { logDowntime, getDowntimes };