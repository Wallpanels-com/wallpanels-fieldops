import crypto from 'node:crypto';

const b64url = data => Buffer.from(data).toString('base64url');
const sign = (data, key) => crypto.createHmac('sha256',key).update(data).digest('base64url');
export function validateTelegramInitData(initData, botToken, now = Math.floor(Date.now()/1000)) {
  if (typeof initData !== 'string' || initData.length > 10000) throw Object.assign(new Error('Invalid Telegram payload'),{status:401});
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !/^[a-f\d]{64}$/i.test(hash) || !Number.isInteger(authDate) || authDate > now+120 || now-authDate > 86400) throw Object.assign(new Error('Telegram authorization expired'),{status:401});
  const data = [...params.entries()].filter(([k])=>k !== 'hash' && k !== 'signature').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256',secret).update(data).digest();
  if (!crypto.timingSafeEqual(Buffer.from(hash,'hex'),expected)) throw Object.assign(new Error('Invalid Telegram signature'),{status:401});
  let user; try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw Object.assign(new Error('Telegram user missing'),{status:401});
  return user;
}
export function issueSession(userId, secret, expiresIn=43200) {
  const header=b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const payload=b64url(JSON.stringify({sub:userId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+expiresIn}));
  const body=`${header}.${payload}`;
  return `${body}.${sign(body,secret)}`;
}
export function readSession(token,secret) {
  const chunks=String(token || '').split('.');
  if (chunks.length!==3) throw Object.assign(new Error('Authentication required'),{status:401});
  const body=`${chunks[0]}.${chunks[1]}`;
  const expected=sign(body,secret);
  const actual=Buffer.from(chunks[2]);const reference=Buffer.from(expected);
  if(actual.length!==reference.length || !crypto.timingSafeEqual(actual,reference)) throw Object.assign(new Error('Session invalid'),{status:401});
  let payload; try {payload=JSON.parse(Buffer.from(chunks[1],'base64url').toString('utf8'));} catch {}
  if (!payload || !payload.sub || !Number.isSafeInteger(payload.exp) || payload.exp < Math.floor(Date.now()/1000)) throw Object.assign(new Error('Session expired'),{status:401});
  return payload.sub;
}
