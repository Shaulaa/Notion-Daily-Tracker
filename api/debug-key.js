export default function handler(req, res) {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  res.json({
    length: key?.length,
    first30: key?.slice(0, 30),
    last30: key?.slice(-30),
    hasLiteralBackslashN: key?.includes('\\n'),
    hasRealNewline: key?.includes('\n'),
  });
}