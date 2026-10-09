// Cria o admin geral (backoffice) ou redefine a senha de um existente. Não existe endpoint público para isso.
//
//   npm run admin:create -- --name "Julio" --email julio@exemplo.com
//   npm run admin:create -- --email julio@exemplo.com --reset      # esqueci a senha (também reativa o admin)
//
// A senha é digitada no prompt (não aparece na tela nem no histórico do terminal).
// Em automação, use a variável ADMIN_PASSWORD. Mínimo de 10 caracteres.
import { stdin, stdout, exit } from 'node:process';
import readline from 'node:readline/promises';
import db from '../db/knex.js';
import { createAdmin, resetAdminPassword } from '../services/adminAccounts.js';

function parseArgs(argv) {
  const out = { reset: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--reset') out.reset = true;
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--email') out.email = argv[++i];
    else { console.error(`Argumento desconhecido: ${a}`); exit(1); }
  }
  return out;
}

// Lê a senha sem mostrar o que é digitado (terminal interativo); se a entrada for um pipe, lê uma linha normal.
async function askPassword(label) {
  if (!stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin });
    const line = await new Promise((resolve) => rl.once('line', resolve));
    rl.close();
    return line;
  }
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve) => {
    let buffer = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(buffer);
          return;
        }
        if (ch === '\u0003') { stdout.write('\n'); exit(130); } // Ctrl+C
        if (ch === '\u007f' || ch === '\b') buffer = buffer.slice(0, -1);
        else buffer += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) { console.error('Informe --email.'); exit(1); }
  if (!args.reset && !args.name) { console.error('Informe --name (ou use --reset para redefinir a senha).'); exit(1); }

  const password = process.env.ADMIN_PASSWORD || await askPassword('Senha (mín. 10 caracteres): ');
  if (!process.env.ADMIN_PASSWORD && stdin.isTTY) {
    const again = await askPassword('Repita a senha: ');
    if (again !== password) { console.error('As senhas não conferem.'); exit(1); }
  }

  try {
    if (args.reset) {
      const admin = await resetAdminPassword(db, { email: args.email, password });
      console.log(`Senha redefinida para ${admin.email}.`);
    } else {
      const admin = await createAdmin(db, { name: args.name, email: args.email, password });
      console.log(`Admin criado: #${admin.id} ${admin.name} <${admin.email}>`);
    }
  } catch (err) {
    console.error(err.status ? `Erro: ${err.message}` : err);
    exit(1);
  } finally {
    await db.destroy();
  }
}

await main();
