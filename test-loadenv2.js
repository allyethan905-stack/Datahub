import { loadEnv } from 'vite';
process.env.MY_VAR = 'hello';
const env = loadEnv('development', '.', '');
console.log('env.MY_VAR:', env.MY_VAR);
