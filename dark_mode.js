const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  ['bg-white', 'bg-slate-900'],
  ['bg-slate-50', 'bg-slate-800/50'],
  ['bg-slate-100', 'bg-slate-800'],
  ['bg-slate-200', 'bg-slate-700'],
  ['bg-blue-50', 'bg-slate-800/50'],
  ['bg-blue-100', 'bg-slate-800'],
  ['bg-blue-600', 'bg-emerald-600'],
  ['bg-blue-500', 'bg-emerald-500'],
  ['bg-blue-900', 'bg-slate-950'],
  ['bg-red-50', 'bg-rose-900/20'],
  ['bg-red-100', 'bg-rose-900/40'],
  ['bg-red-500', 'bg-rose-500'],
  ['bg-red-600', 'bg-rose-600'],
  ['bg-green-50', 'bg-emerald-900/20'],
  ['bg-green-100', 'bg-emerald-900/40'],
  ['bg-green-500', 'bg-emerald-500'],
  ['bg-amber-50', 'bg-amber-900/20'],
  ['bg-amber-100', 'bg-amber-900/40'],
  ['bg-purple-50', 'bg-indigo-900/20'],
  ['bg-purple-100', 'bg-indigo-900/40'],
  
  ['text-slate-900', 'text-slate-100'],
  ['text-slate-800', 'text-slate-200'],
  ['text-slate-700', 'text-slate-300'],
  ['text-slate-600', 'text-slate-400'],
  ['text-slate-500', 'text-slate-400'],
  ['text-blue-900', 'text-slate-100'],
  ['text-blue-800', 'text-slate-200'],
  ['text-blue-600', 'text-emerald-400'],
  ['text-blue-500', 'text-emerald-500'],
  ['text-blue-400', 'text-slate-400'],
  ['text-blue-300', 'text-slate-500'],
  ['text-red-900', 'text-rose-100'],
  ['text-red-700', 'text-rose-400'],
  ['text-red-600', 'text-rose-500'],
  ['text-red-500', 'text-rose-500'],
  ['text-green-700', 'text-emerald-400'],
  ['text-green-600', 'text-emerald-500'],
  ['text-amber-700', 'text-amber-400'],
  ['text-amber-600', 'text-amber-500'],
  ['text-purple-700', 'text-indigo-400'],
  ['text-purple-600', 'text-indigo-500'],

  ['border-slate-200', 'border-slate-800'],
  ['border-slate-100', 'border-slate-800'],
  ['border-blue-100', 'border-slate-800'],
  ['border-blue-50', 'border-slate-800'],
  ['border-blue-200', 'border-slate-700'],
  ['border-red-100', 'border-rose-900/50'],
  ['border-green-100', 'border-emerald-900/50'],
  ['border-amber-100', 'border-amber-900/50'],
  ['border-purple-100', 'border-indigo-900/50'],
  
  ['from-blue-50', 'from-slate-800/50'],
  ['to-blue-100', 'to-slate-800'],
  ['from-blue-600', 'from-emerald-600'],
  ['to-blue-800', 'to-emerald-800'],
  ['from-slate-50', 'from-slate-800/50'],
  ['to-slate-100', 'to-slate-800'],
  ['from-white', 'from-slate-900'],
  ['to-blue-50', 'to-slate-800/50'],
  ['from-purple-50', 'from-indigo-900/20'],
  ['to-purple-100', 'to-indigo-900/40'],
  ['from-red-50', 'from-rose-900/20'],
  ['to-red-100', 'to-rose-900/40'],
  ['from-amber-50', 'from-amber-900/20'],
  ['to-amber-100', 'to-amber-900/40'],

  ['hover:bg-slate-50', 'hover:bg-slate-800/80'],
  ['hover:bg-slate-100', 'hover:bg-slate-700'],
  ['hover:bg-blue-50', 'hover:bg-slate-800/80'],
  ['hover:bg-blue-600', 'hover:bg-emerald-500'],
  ['hover:text-blue-600', 'hover:text-emerald-400'],
  ['hover:text-blue-900', 'hover:text-white'],
  ['hover:border-blue-300', 'hover:border-emerald-500'],
  ['hover:shadow-blue-900/20', 'hover:shadow-emerald-900/20'],
  ['hover:bg-red-50', 'hover:bg-rose-900/30'],
  ['hover:bg-green-50', 'hover:bg-emerald-900/30'],

  ['shadow-blue-900/10', 'shadow-black/40'],
  ['shadow-blue-900/20', 'shadow-black/50'],

  ['focus:ring-blue-500', 'focus:ring-emerald-500'],
  ['focus:border-blue-500', 'focus:border-emerald-500'],
  ['placeholder-blue-300', 'placeholder-slate-500'],
  ['bg-blue-50/50', 'bg-slate-800/30'],
  ['bg-green-50/30', 'bg-emerald-900/20'],
  ['hover:bg-green-50/60', 'hover:bg-emerald-900/40'],
  ['bg-red-50/30', 'bg-rose-900/20'],
  ['hover:bg-red-50/60', 'hover:bg-rose-900/40'],
  ['bg-gradient-to-br from-blue-900 to-slate-900', 'bg-gradient-to-br from-slate-900 to-slate-950'],
];

for (const [from, to] of replacements) {
  const escapedFrom = from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(?<=[\\s"'\`])` + escapedFrom + `(?=[\\s"'\`])`, 'g');
  content = content.replace(regex, to);
}

// Fix some specific cases where text-white might be better
content = content.replace(/text-slate-100 font-black/g, 'text-white font-black');

fs.writeFileSync('src/App.tsx', content);
console.log('Replacements done.');
