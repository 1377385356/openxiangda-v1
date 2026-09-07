#!/usr/bin/env node
import { main } from "../src/build-source/src/cli.mjs";

await main(process.argv.slice(2));
