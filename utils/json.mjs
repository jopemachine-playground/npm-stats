import fs from 'node:fs';

export default filePath => JSON.parse(fs.readFileSync(filePath));
