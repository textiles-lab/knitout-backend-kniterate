#!/bin/sh
':' //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
"use strict";

const fs = require('fs');
const child_process = require('child_process');

for (const dirent of fs.readdirSync('.', {withFileTypes:true})) {
	if (dirent.isFile() && dirent.name.endsWith('.k')) {
		console.log(`---- ${dirent.name} ----`);
		child_process.execFileSync('node', [
			'../knitout-to-kcode.js',
			dirent.name,
			dirent.name + 'c'
		]);
	}
}
