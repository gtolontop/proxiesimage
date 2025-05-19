import React, { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v2/image';
const API_KEY = 'REDACTED_API_KEY';

const App: React.FC = () => {
  const [link, setLink] = useState<string>('');
  const [error, setError] = useState<string>('');

  const upload = async (f: File) => {
    setError(''); setLink('');
    const fd = new FormData();
    fd.append('file', f);
    try {
      const res = await axios.post(API_URL, fd, {
        headers: { Authorization: API_KEY },
      });
      if (res.data.status === 'ok') {
        setLink(res.data.data.url);
      } else {
        setError(JSON.stringify(res.data));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
      <h1>Upload d'image</h1>
      <input
        type="file"
        accept="image/*"
        onChange={e => { if (e.target.files) upload(e.target.files[0]); }}
      />
      {link && <p>URL publique : <a href={link} target="_blank">{link}</a></p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default App;
