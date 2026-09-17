import { clearCookie } from './_auth.js';

export default function handler(req, res) {
  res.setHeader('set-cookie', clearCookie());
  res.setHeader('location', '/login.html');
  return res.status(302).end();
}
