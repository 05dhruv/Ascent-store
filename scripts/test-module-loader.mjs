import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
registerHooks({resolve(specifier,context,nextResolve) {
  if(specifier.startsWith('@/')) {
    let path=resolve('src',specifier.slice(2));
    if(!/\.(js|mjs)$/.test(path))path+='.js';
    return nextResolve(pathToFileURL(path).href,context);
  }
  return nextResolve(specifier,context);
}});
