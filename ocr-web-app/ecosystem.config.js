module.exports = {
  apps: [
    {
      name: 'ocr-backend',
      script: '../venv/bin/uvicorn',
      args: 'api.index:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      cwd: '.',
      env: {
        PYTHONPATH: '.'
      }
    },
    {
      name: 'ocr-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: './frontend',
      env: {
        VITE_API_URL: 'http://localhost:8000'
      }
    }
  ]
};
