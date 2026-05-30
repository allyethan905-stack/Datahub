import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  ['border-blue-50', 'border-slate-800'],
  ['border-blue-200', 'border-slate-700'],
  ['border-blue-800', 'border-indigo-800'],
  ['border-slate-50', 'border-slate-800'],
];

for (const [from, to] of replacements) {
  const escapedFrom = from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(?<=[\\s"'\`])` + escapedFrom + `(?=[\\s"'\`])`, 'g');
  content = content.replace(regex, to);
}

fs.writeFileSync('src/App.tsx', content);
console.log('Replacements done.');
