#!/bin/sh
':'; //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
'use strict';

//------------------------------------

const fs = require('fs');

let inFile = process.argv[2];
let outFile = process.argv[3];

const fullGauge = fs.readFileSync(inFile, 'utf8');
let lines = fullGauge.split('\n');
let halfGauge = [];

let rackCount = 0,
	xferCount = 0;

// fn -> f(2n)
// fsn -> f(2n+1)
// bn -> b(2n+1)
// bs -> b(2n)

const commentCheck = (line, str, skipPush) => {
	if (line.indexOf(';') !== -1 && line.indexOf(';') < line.indexOf(str)) {
		if (!skipPush) halfGauge.push(line);
		return true;
	} else return false;
};

const replaceValue = (line, bn) => {
	if (!commentCheck(line, bn)) {
		let splitLine = line.split(bn);
		let needle = bn.match(/\d+/g)[0];
		let bed = bn.slice(0, bn.indexOf(needle));
		//
		if (line.includes('xfer') && (rackCount !== xferCount || xferCount === 0)) {
			++xferCount;
			if (rackCount < xferCount) {
				//meaning rack was 0 & it wasn't specified
				halfGauge.push(`rack 0`); //might be changed later
				console.warn('inserting temp rack 0'); //remove
				++rackCount;
			}
		}
		//
		if (bed === 'fs' || bed === 'b') {
			return splitLine.join(`${bed.charAt(0)}${2 * needle + 1}`);
		} else {
			return splitLine.join(`${bed.charAt(0)}${2 * needle}`);
		}
	}
};

let arr = [1, 2];
let bedNeedle;
const testForBed = (line, bed) => {
	if (typeof line === 'object') {
		let lineMatch = line.find((str) => str.match(`${bed}[0-9]+`) !== null);
		// if (line.some((str) => str.match(`${bed}[0-9]+`) !== null)) {
		if (lineMatch !== undefined) {
			bedNeedle = lineMatch;
			return true;
		}
	} else {
		if (line.match(`${bed}[0-9]+`) !== null) {
			bedNeedle = line.match(`${bed}[0-9]+`)[0];
			return true;
		}
	}
};

let initRack = false;
for (let i = 0; i < lines.length; ++i) {
	if (lines[i].charAt(0) === ';' || lines[i].includes('x-')) {
		halfGauge.push(lines[i]);
	} else {
		if (lines[i].includes('rack')) {
			initRack = true; //?
			if (!commentCheck(lines[i], 'rack')) {
				let rackInfo = lines[i].split(' ');
				let oldRack = parseInt(rackInfo[1]);
				let newRack = 2 * oldRack - 1; //assuming the racking stays the same if > 1, but need to //check
				findxfer: for (let r = i + 1; r < lines.length; ++r) {
					//TODO: something similar for split ?
					if (
						(lines[r].includes('rack') && !commentCheck(lines[r], 'rack', true)) ||
						(lines[r].includes('knit') && !commentCheck(lines[r], 'knit', true)) ||
						(lines[r].includes('tuck') && !commentCheck(lines[r], 'tuck', true)) ||
						(lines[r].includes('drop') && !commentCheck(lines[r], 'drop', true)) //? //check because seems like sliders could actually be involved in tuck
					) {
						console.warn(`not changing rack value based on xfer because a ${lines[r].split(' ')[0]} op occurs before any xfers.\n`); //remove //?
						break findxfer;
					}
					/////
					if (lines[r].includes('xfer') && !commentCheck(lines[r], 'xfer', true)) {
						++rackCount;
						let xferInfo = lines[r].split(' ');
						if ((testForBed(xferInfo, 'fs') && testForBed(xferInfo, 'bs'))) { // both fs & bs
							newRack = (2 * oldRack) + 1;
						} else if (testForBed(xferInfo, 'fs') || testForBed(xferInfo, 'bs')) { // only one is either fs||bs, & other is b||f
							newRack = 2 * oldRack;
						}
						break findxfer;
					}
				}
				halfGauge.push(`rack ${newRack}`);
			}
		} else {
			bedNeedle = null;
			let newLine = lines[i];
			if (testForBed(lines[i], 'fs')) {
				newLine = replaceValue(newLine, bedNeedle);
			} else if (testForBed(lines[i], 'f')) {
				newLine = replaceValue(newLine, bedNeedle);
			}
			if (testForBed(lines[i], 'bs')) {
				newLine = replaceValue(newLine, bedNeedle);
			} else if (testForBed(lines[i], 'b')) {
				newLine = replaceValue(newLine, bedNeedle);
			}
			if (!initRack && bedNeedle !== null) {
				halfGauge.push('rack -1'); //equivalent to rack 0 for non-slider (aka when knitting) //TODO: double check to confirm that sliders are never engaged during knitting/tucking/missing
				++rackCount; //?
				initRack = true;
			}
			if (newLine.includes('xfer')) {
				let prevRackIdx = halfGauge.map((line) => line.includes('rack ') && !commentCheck(line, 'rack', true)).lastIndexOf(true);
				let prevRack = halfGauge[prevRackIdx];
				prevRack = parseInt(prevRack.split(' ')[1]);
				let frontN = parseInt(newLine.match('f[0-9]+')[0].slice(1));
				let backN = parseInt(newLine.match('b[0-9]+')[0].slice(1));
				if (prevRack !== frontN - backN) {
					console.warn(`Changing rack value from ${prevRack} to ${frontN - backN}.\nOld line: ${lines[i]}\nNew line: ${newLine}\n`);
					halfGauge.splice(prevRackIdx, 1, `rack ${frontN - backN}`);
				}
			}
			halfGauge.push(newLine);
		}
	}
}

fs.writeFileSync(outFile, halfGauge.join('\n'));