import fs from 'fs';

['src/app/catalog/products/create/page.jsx', 'src/app/catalog/products/[id]/edit/page.jsx', 'src/app/catalog/products/page.jsx'].forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');

  let cards = 0;
  let divs = 0;

  lines.forEach((line) => {
    const cOpen = (line.match(/<Card\b/g) || []).length;
    const cClose = (line.match(/<\/Card>/g) || []).length;
    cards += cOpen - cClose;

    const dOpen = (line.match(/<div\b/g) || []).length;
    const dClose = (line.match(/<\/div>/g) || []).length;
    divs += dOpen - dClose;
  });

  console.log(`${file} -> Cards unclosed: ${cards}, Divs unclosed: ${divs}`);
});
