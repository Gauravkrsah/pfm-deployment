const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', 'backend', '.env');
const parsed = dotenv.parse(fs.readFileSync(envPath));

// Only expose browser-safe settings to Create React App. In particular, do
// not let backend PORT or service keys alter/leak into the frontend process.
for (const [key, value] of Object.entries(parsed)) {
  if ((key.startsWith('REACT_APP_') || key === 'DANGEROUSLY_DISABLE_HOST_CHECK') && process.env[key] === undefined) {
    process.env[key] = value;
  }
}
