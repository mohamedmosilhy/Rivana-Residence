import { config } from "dotenv";

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import {
  StaffAdminError,
  createStaff,
  listStaff,
  revokeStaffSessions,
  setStaffActive,
  setStaffPassword,
  setStaffRole,
} from "./staff-admin.ts";

config({ quiet: true });

const usage = `Usage: npm run staff -- <command> [options]

Commands:
  create --email <email> --name <name> --role <ADMIN|EDITOR>
  set-password --email <email>       Operator password reset; ends all sessions
  deactivate --email <email>         Blocks sign-in and ends all sessions
  activate --email <email>
  set-role --email <email> --role <ADMIN|EDITOR>
  revoke-sessions --email <email>
  list

Passwords are never accepted as arguments. They are prompted for without
echo, or read from standard input with --password-stdin.`;

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

function promptHidden(question: string) {
  return new Promise<string>((resolve) => {
    const rl = createInterface({
      input: stdin,
      output: stdout,
      terminal: true,
    });
    const writer = rl as unknown as { _writeToOutput(value: string): void };
    writer._writeToOutput = (value) => {
      if (value.includes(question)) stdout.write(value);
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPassword(fromStdin: boolean) {
  if (fromStdin) return readStdin();
  if (!stdin.isTTY) {
    throw new StaffAdminError(
      "No terminal available. Pipe the password and pass --password-stdin.",
    );
  }
  const first = await promptHidden("New password: ");
  const second = await promptHidden("Repeat password: ");
  if (first !== second) throw new StaffAdminError("Passwords did not match.");
  return first;
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    "password-stdin": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
const [command] = positionals;

if (values.help || !command) {
  console.log(usage);
  process.exit(command ? 0 : 1);
}

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new PrismaClient({
  // Timestamps must round-trip in UTC; see src/infrastructure/db/prisma/client.ts.
  adapter: new PrismaPg({
    connectionString: databaseUrl,
    options: "-c TimeZone=UTC",
  }),
});
const email = values.email ?? "";

try {
  switch (command) {
    case "create": {
      const password = await readPassword(values["password-stdin"]);
      const user = await createStaff(client, {
        email,
        name: values.name ?? "",
        role: values.role ?? "",
        password,
      });
      console.log(`Created ${user.role.toLowerCase()} ${user.email}.`);
      break;
    }
    case "set-password":
      await setStaffPassword(
        client,
        email,
        await readPassword(values["password-stdin"]),
      );
      console.log(`Password updated for ${email}; all sessions ended.`);
      break;
    case "deactivate":
      await setStaffActive(client, email, false);
      console.log(`Deactivated ${email}; all sessions ended.`);
      break;
    case "activate":
      await setStaffActive(client, email, true);
      console.log(`Activated ${email}.`);
      break;
    case "set-role":
      await setStaffRole(client, email, values.role ?? "");
      console.log(`Role for ${email} set to ${values.role}.`);
      break;
    case "revoke-sessions":
      console.log(
        `Ended ${await revokeStaffSessions(client, email)} session(s) for ${email}.`,
      );
      break;
    case "list":
      console.table(await listStaff(client));
      break;
    default:
      console.error(`Unknown command "${command}".\n\n${usage}`);
      process.exitCode = 1;
  }
} catch (error) {
  if (!(error instanceof StaffAdminError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
