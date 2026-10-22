const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/stores', require('./routes/stores'));
app.use('/api/periods', require('./routes/periods'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/ad-accounts', require('./routes/adAccounts'));
app.use('/api/expenses', require('./routes/expenses'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
