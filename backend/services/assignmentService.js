// services/assignmentService.js
const supabase = require('../supabaseClient');

async function suggestAssignment(jobId) {
  // Example: Suggest available worker with least assignments
  const { data: workers, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('role', 'labour');
  if (error) throw error;

  let minAssignments = Infinity;
  let suggestedWorker = null;
  for (const worker of workers) {
    const { count, error: countError } = await supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', worker.id);
    if (countError) throw countError;
    if (count < minAssignments) {
      minAssignments = count;
      suggestedWorker = worker;
    }
  }
  return suggestedWorker;
}

async function createAssignment(assignmentData) {
  const { data, error } = await supabase.from('assignments').insert([assignmentData]).select();
  if (error) throw error;
  return data[0];
}

async function approveAssignment(assignmentId, supervisorId) {
  const { data, error } = await supabase
    .from('assignments')
    .update({ approved: true, supervisor_id: supervisorId })
    .eq('id', assignmentId)
    .select();
  if (error) throw error;
  return data[0];
}

module.exports = { suggestAssignment, createAssignment, approveAssignment };