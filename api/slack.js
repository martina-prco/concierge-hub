export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, user_name } = req.body;

  console.log('Slack event received:', { text, user_name });

  res.status(200).json({ 
    success: true, 
    received: { text, user_name } 
  });
}
