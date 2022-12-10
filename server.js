const express = require('express');
const http = require('http');
const fs = require('fs');
const pfs = fs.promises;

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
server.listen(process.env.PORT);

// compress src into one js file
let getSrc = (dir) => new Promise(async (resolve, reject) => {
  let out = '';
  for (let f of fs.readdirSync(dir)) {
    if (f.endsWith('js')) {
      let d = await pfs.readFile(dir + f, 'utf8');
      out += `\n/** ${dir + f} **/\n\n${d}\n\n`;
    } else out += await getSrc(dir + f + '/');
  }
  resolve(out);
});

(async function () {
  const src = await getSrc('./src/');
  fs.writeFileSync('./public/exolands.js', src);
  console.log('wrote to src')
})();