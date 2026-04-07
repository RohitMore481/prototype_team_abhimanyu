// implement performance tracking:
// - calculate efficiency
// - track job completion time
// - store in performance_logs

const supabase = require('./supabaseClient');

// Calculate efficiency for a job
async function calculateEfficiency(jobId) {
  const { data: job, error } = await supabase
    .from('jobs')
    .select('output, input, start_time, end_time')
    .eq('id', jobId)
    .single();

  if (error) throw error;
  if (!job || !job.input) throw new Error('Invalid job data');

  // Example efficiency calculation: output/input per hour
  const durationHours = (new Date(job.end_time) - new Date(job.start_time)) / 3600000;
  const efficiency = (job.output / job.input) / durationHours;

  // Store in performance_logs
  await storePerformanceLog({
    job_id: jobId,
    efficiency,
    calculated_at: new Date().toISOString(),
  });

  return efficiency;
}

// Track job completion time and update job record
async function trackJobCompletionTime(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .update({ end_time: new Date().toISOString() })
    .eq('id', jobId)
    .select();

  if (error) throw error;
  return data;
}

// Store a performance log entry
async function storePerformanceLog(logData) {
  const { data, error } = await supabase
    .from('performance_logs')
    .insert([logData])
    .select();

  if (error) throw error;
  return data;
}

module.exports = {
  calculateEfficiency,
  trackJobCompletionTime,
  storePerformanceLog,
};