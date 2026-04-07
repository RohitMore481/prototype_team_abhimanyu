// services/jobService.js
const supabase = require('../supabaseClient');

async function createJob(jobData) {
  const { data, error } = await supabase.from('jobs').insert([jobData]).select();
  if (error) throw error;
  return data[0];
}

async function getJob(jobId) {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (error) throw error;
  return data;
}

async function updateJob(jobId, updates) {
  const { data, error } = await supabase.from('jobs').update(updates).eq('id', jobId).select();
  if (error) throw error;
  return data[0];
}

async function listJobs(filter = {}) {
  let query = supabase.from('jobs').select('*');
  Object.entries(filter).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

module.exports = { createJob, getJob, updateJob, listJobs };