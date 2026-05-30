
console.log('Node version:', process.version);
console.log('fetch available:', typeof fetch !== 'undefined');
if (typeof fetch === 'undefined') {
  console.log('fetch is NOT available in this environment.');
} else {
  console.log('fetch is available.');
}
