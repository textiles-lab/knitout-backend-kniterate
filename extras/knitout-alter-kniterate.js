#!/bin/sh
':'; //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
'use strict';

//------------------------------------
//TODO: add option too only do one of these things (or just replace carriers)
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

let inFile, outFile, file, lines;
let defaultRollerAdvance = 400, defaultStitchNumber = 6, defaultSpeedNumber = 300;
let rollerAdvance, xferRollerAdvance, stitchNumber, xferStitchNumber, speedNumber, xferSpeedNumber;
let carriers = [];
let changedCarriers = [];
let carrierChange = ({from, to}) => ({
	from: from,
	to: to
});

// Create a promise based version of rl.question so we can use it in async functions
const question = (str) => new Promise(resolve => rl.question(str, resolve));

// all the steps involved, executed asynchronously 
const steps = {
	start: async () => {
		inFile = await question(`Path to input file: `);
		console.log('\nPress Enter to skip any of the following prompts.\n');
		return steps.rollerAdvance();
	},
	rollerAdvance: async () => {
		rollerAdvance = await question(`Roller advance per pass: `);
		if (rollerAdvance) defaultRollerAdvance = rollerAdvance;
		return steps.xferRollerAdvance();
	},
	xferRollerAdvance: async () => {
		xferRollerAdvance = await question(`Roller advance for transfers: `);
		return steps.stitchNumber();
	},
	stitchNumber: async () => {
		stitchNumber = await question(`Main stitch number (for knit/tuck): `);
		if (stitchNumber) defaultStitchNumber = stitchNumber;
		return steps.xferStitchNumber();
	},
	xferStitchNumber: async () => {
		xferStitchNumber = await question(`Stitch number for transfers: `);
		return steps.speedNumber();
	},
	speedNumber: async () => {
		speedNumber = await question(`Main speed number (for knit/tuck): `);
		if (speedNumber) defaultSpeedNumber = speedNumber;
		return steps.xferSpeedNumber();
	},
	xferSpeedNumber: async () => {
		xferSpeedNumber = await question(`Speed number for transfers: `);
		return steps.readFile();
	},
	readFile: async () => {
		file = fs.readFileSync(inFile, { encoding: 'utf8'});
		return steps.parse();
	},
	parse: async () => {
		lines = file.split('\n');
		let xStitch = false,
			xSpeed = false,
			xRoll = false,
			xfer = false;
		//
		function chopOffComment(str) {
			if (str.includes(';')) return str.split(';')[0];
			else return str;
		}
		//
		for (let line in lines) {
			if (lines[line] === '') continue;
			let info = lines[line].split(' ');
			if (info[0].charAt(0) === ';' && info[0].charAt(1) === ';') {
				if (info[0] === ';;Carriers:') lines[line] = ';;Carriers: 1 2 3 4 5 6';
				else if (info[0] === ';;Machine:') lines[line] = ';;Machine: Kniterate';
			} else if (info[0] === 'in' || info[0] === 'inhook') {
				if (!carriers.includes(info[1])) carriers.push(info[1]);
				if (info[0] === 'inhook') {
					lines[line] = `in ${info[1]}`;
				}
				if (!xStitch || !xSpeed || !xRoll) {
					if (!xStitch) lines[line] = `x-stitch-number ${defaultStitchNumber}\n${lines[line]}`;
					if (!xSpeed) lines[line] = `x-speed-number ${defaultSpeedNumber}\n${lines[line]}`;
					if (!xRoll) lines[line] = `x-roller-advance ${defaultRollerAdvance}\n${lines[line]}`;
				}
			} else if (info[0] === 'x-stitch-number') {
				xStitch = true;
				if (stitchNumber) lines[line] = `x-stitch-number ${stitchNumber}`;
				else defaultStitchNumber = chopOffComment(info[1]);
			} else if (info[0] === 'x-speed-number') {
				xSpeed = true;
				if (speedNumber) lines[line] = `x-speed-number ${speedNumber}`;
				else defaultSpeedNumber = chopOffComment(info[1]);
			} else if (info[0] === 'x-roller-advance') {
				xRoll = true;
				if (rollerAdvance) lines[line] = `x-roller-advance ${rollerAdvance}`;
				else defaultRollerAdvance = chopOffComment(info[1]);
			} else if (info[0] === 'releasehook') {
				lines[line] = '';
			} else if (info[0] === 'outhook') {
				lines[line] = `out ${info[1]}`;
			} else if (!xfer && info[0] === 'xfer') {
				let replacementLine = '';
				if (xferStitchNumber) replacementLine += `x-stitch-number ${xferStitchNumber}\n`;
				if (xferSpeedNumber) replacementLine += `x-speed-number ${xferSpeedNumber}\n`;
				if (xferRollerAdvance) replacementLine += `x-roller-advance ${xferRollerAdvance}\n`;
				replacementLine += `${lines[line]}`;
				lines[line] = replacementLine;
				xfer = true;
			} else if (info[0] === 'x-presser-mode') lines[line] = '';
			//
			if (xfer && info[0] !== 'xfer' && info[0] !== 'rack' && info[0].charAt(0) !== ';') {
				let replacementLine = '';
				if (xferStitchNumber) replacementLine += `x-stitch-number ${defaultStitchNumber}\n`;
				if (xferSpeedNumber) replacementLine += `x-speed-number ${defaultSpeedNumber}\n`;
				if (xferRollerAdvance) replacementLine += `x-roller-advance ${defaultRollerAdvance}\n`;
				replacementLine += `${lines[line]}`;
				lines[line] = replacementLine;
				xfer = false;
			}
		}
		lines = lines.join('\n');
		return steps.changeCarriers();
	},
	changeCarriers: async () => {
		let change = await question(`Would you like to change any of the carriers? [y/n] `);
		if (change.toLowerCase() === 'y') {
			for (let c in carriers) {
				let newCarrier = await question(`Which carrier would you like to change '${carriers[c]}' to? `);
				newCarrier = newCarrier.toString().match(/\d+/g)[0];
				changedCarriers.push(carrierChange({ from: carriers[c], to: newCarrier }));
			}
			lines = lines.split('\n');
			for (let line in lines) {
				let info = lines[line].split(' ');
				let comment = '';
				if (info[info.length - 1].includes(';')) {
					comment = info[info.length - 1].split(';');
					info[info.length - 1] = comment[0];
					comment = `;${comment[1]}`;
				}
				if (info[0] === 'in' || info[0] === 'out') {
					lines[line] = `${info[0]} ${changedCarriers.find(c => c.from == info[1] ).to}${comment}`;
				} else if (info[0] === 'knit' || info[0] === 'tuck' || info[0] === 'miss') { //TODO: deal with split
					info[3] = changedCarriers.find(c => c.from == info[3]).to;
					lines[line] = `${info.join(' ')}${comment}`;
				}
			}
			lines = lines.join('\n');
		}
		return steps.writeFile();
	},
	writeFile: async () => {
		outFile = await question(`Filename for output knitout: `);
		fs.writeFileSync(outFile, lines);
		return steps.end();
	},
	end: async () => {
		rl.close();
	},
};

// Start the program
steps.start();