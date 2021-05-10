#!/bin/sh
':'; //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
'use strict';

//------------------------------------
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

let inFile, outFile, file, header;
let lines = [];
let defaultRollerAdvance = 400, defaultStitchNumber = 6, defaultSpeedNumber = 300;
let defaultWasteCarrier = '1', defaultDrawCarrier = '2', defaultCastonCarrier = '1';
let defaultCastonStyle = 1;

let rollerAdvance, stitchNumber, speedNumber;
let wasteCarrier, drawCarrier, castonCarrier;
let castonStyle;

let minN, maxN, wasteMin, wasteMax;
let width, wastePasses = 70;
let carriers = [], inCarriers = [];

// Create a promise based version of rl.question so we can use it in async functions
const question = (str) => new Promise(resolve => rl.question(str, resolve));

// all the steps involved, executed asynchronously 
const steps = {
	start: async () => {
		inFile = await question(`Path to input file (press Enter to create waste section without file): `);
		if (!inFile) {
			minN = await question(`Min needle number: `);
			minN = Number(minN);
			maxN = await question(`Max needle number: `);
			maxN = Number(maxN);
		}
		console.log(`\nROLLER ADVANCE: 400\nSTITCH NUMBER: 6\nSPEED NUMBER: 300\nWASTE YARN CARRIER: 1\nDRAW THREAD CARRIER: 2\nCAST-ON STYLE: closed tube\nCAST-ON CARRIER: 1`);
		console.log(`\n^ **press Enter to skip any of the following prompts & use the respective default extension value (listed above) for the waste section**`);
		console.log(`\nSETTINGS FOR WASTE SECTION:`);
		return steps.rollerAdvance();
	},
	rollerAdvance: async () => {
		rollerAdvance = await question(`Roller advance: `);
		if (!rollerAdvance) rollerAdvance = defaultRollerAdvance;
		return steps.stitchNumber();
	},
	stitchNumber: async () => {
		stitchNumber = await question(`Stitch number: `);
		if (!stitchNumber) stitchNumber = defaultStitchNumber;
		return steps.speedNumber();
	},
	speedNumber: async () => {
		speedNumber = await question(`Speed number: `);
		if (!speedNumber) speedNumber = defaultSpeedNumber;
		return steps.wasteCarrier();
	},
	wasteCarrier: async () => {
		wasteCarrier = await question(`Carrier to use for waste yarn: `);
		if (!wasteCarrier) wasteCarrier = defaultWasteCarrier;
		carriers.push(wasteCarrier);
		return steps.drawCarrier();
	},
	drawCarrier: async () => {
		drawCarrier = await question(`Carrier to use for draw thread: `);
		if (!drawCarrier) drawCarrier = defaultDrawCarrier;
		if (!carriers.includes(drawCarrier)) carriers.push(drawCarrier);
		return steps.castonStyle();
	},
	castonStyle: async () => {
		castonStyle = await question(`\n*Cast-on style* --- OPTIONS:\n[0] Cast-on section already included\n[1] Closed tube\n[2] Open tube\nInput the number associated with your chosen style from the above list (or press Enter for default value): `);
		if (castonStyle) {
			castonStyle = Number(castonStyle);
		} else castonStyle = defaultCastonStyle;
		if (castonStyle === 0) return steps.readFile();
		else return steps.castonCarrier();
	},
	castonCarrier: async () => {
		castonCarrier = await question(`Carrier to use for cast-on: `);
		if (!castonCarrier) castonCarrier = defaultCastonCarrier;
		if (!carriers.includes(castonCarrier)) carriers.push(castonCarrier);
		if (inFile) return steps.readFile();
		else {
			let additionalCarriers = await question(`If you will be using any other carriers besides those designated for waste yarn: ${wasteCarrier}, draw thread: ${drawCarrier}, and cast-on: ${castonCarrier}, please list them, separated by spaces (e.g. 1 2 3). Otherwise, just press Enter. `);
			if (additionalCarriers) {
				additionalCarriers = additionalCarriers.trim().split(' ');
				for (let c in additionalCarriers) if (!carriers.includes(additionalCarriers[c])) carriers.push(additionalCarriers[c]);
			}
			return steps.parse();
		}
	},
	readFile: async () => {
		file = fs.readFileSync(inFile, { encoding: 'utf8'});
		return steps.parse();
	},
	parse: async () => {
		let wasteSection = [`x-roller-advance ${rollerAdvance}`, `x-stitch-number ${stitchNumber}`, `x-speed-number ${speedNumber}`];
		let inWasteC = false, inDrawC = false, inCastonC = false;
		let negCarriers = [];
		if (file) {
			lines = file.split('\n');
			header = lines.splice(0, lines.findIndex(ln => ln.split(' ')[0] === 'in'));
			let inCarrier = lines[0].split(' ')[1].charAt(0); //note: charAt is fine here since kniterate only has single-digit carriers //TODO: change if make waste-section.js for SWG too
			lines.shift();
			if (inCarrier === wasteCarrier) {
				inWasteC = true;
			}
			if (inCarrier === drawCarrier) inDrawC = true;
			if (castonStyle === 0 || inCarrier === castonCarrier) inCastonC = true;
			inCarriers = [inCarrier];
			lines.map((ln, idx) => {
				let info = ln.trim().split(' ');
				if (info[0] === 'in' && info.length > 1) {
					let c = info[1].charAt(0);
					if (!inCarriers.includes(c)) {
						lines.splice(idx, 1);
						inCarriers.push(c);
						if (!carriers.includes(c)) carriers.push(c);
					}
				}
			});
		} else {
			// let carrierList = (machine.toLowerCase() === 'kniterate' ? '1 2 3 4 5 6' : '1 2 3 4 5 6 7 8 9 10'); //for now, assume machine is kniterate since SWGs don't *need* a waste section	
			header = [';!knitout-2', `;;Machine: Kniterate`, `;;Carriers: 1 2 3 4 5 6`];
		}
		let otherCarriers = carriers.filter(c => c !== wasteCarrier && c !== drawCarrier && c !== castonCarrier);
		let wasteDir = '-', drawDir = '+', castonDir = '+';
		if (inCarriers.includes(castonCarrier)) { //empty if !file, so will skip
			for (let i = 0; i < lines.length; ++i) {
				let info = lines[i].trim().split(' ');
				if (info.length > 1 && !info[0].includes(';')) {
					if (info[info.length - 1] === castonCarrier) {
						if (info[1] === '+') {
							if (castonCarrier !== wasteCarrier) negCarriers.push(castonCarrier);
							castonDir = '-';
							break;
						} else if (info[1] === '-') {
							castonDir = '+';
							break;
						}
					}
				}
			}
		}
		if (drawCarrier === castonCarrier) {
			castonDir === '+' ? drawDir = '-' : drawDir = '+';
		} else {
			if (inCarriers.includes(drawCarrier)) {
				for (let i = 0; i < lines.length; ++i) {
					let info = lines[i].trim().split(' ');
					if (info.length > 1 && !info[0].includes(';')) {
						if (info[info.length - 1] === drawCarrier) {
							if (info[1] === '+') {
								if (drawCarrier !== wasteCarrier) negCarriers.push(drawCarrier);
								drawDir = '-';
								break;
							} else if (info[1] === '-') {
								drawDir = '+';
								break;
							}
						}
					}
				}
			}
		}
		if (wasteCarrier === drawCarrier) {
			drawDir === '+' ? wasteDir = '-' : wasteDir = '+';
		} else if (wasteCarrier === castonCarrier) {
			castonDir === '+' ? wasteDir = '-' : wasteDir = '+';
		} else {
			if (inCarriers.includes(wasteCarrier)) {
				for (let i = 0; i < lines.length; ++i) {
					let info = lines[i].trim().split(' ');
					if (info.length > 1 && !info[0].includes(';')) {
						if (info[info.length - 1] === wasteCarrier) {
							if (info[1] === '+') {
								wasteDir = '-';
								break;
							} else if (info[1] === '-') {
								wasteDir = '+';
								break;
							}
						}
					}
				}
			}
		}
		if (lines && otherCarriers.length) {
			for (let c = 0; c < otherCarriers.length; ++c) {
				for (let i = 0; i < lines.length; ++i) {
					let info = lines[i].trim().split(' ');
					if (info.length > 1 && !info[0].includes(';')) {
						if (info[info.length - 1] === otherCarriers[c]) {
							if (info[1] === '-') {
								negCarriers.push(otherCarriers[c]);
								break;
							} else if (info[1] === '-') break;
						}
					}
				}
			}
		}

		let removeComment = (str) => {
			if (str.includes(';')) return str.slice(0, str.indexOf(';'));
			else return str;
		};

		if (file) {
			let dir, carrier, rack;
			findMinMax: for (let i = 0; i < lines.length; ++i) {
				let info = lines[i].trim().split(' ');
				if (info[0].charAt(0) !== ';' && info.length > 1) {
					if (info[0] === 'rack') {
						if (!rack || !dir) rack = removeComment(info[1]);
						else if (rack !== info[1].charAt(0)) break findMinMax;
					} else if (info[1] === '+' || info[1] === '-') {
						if (!dir) {
							dir = info[1];
							minN = maxN = Number(removeComment(info[2].slice(1)));
							carrier = info[info.length - 1];
						} else {
							if (info[1] === dir && removeComment(info[info.length - 1]) === carrier) {
								let needle = Number(removeComment(info[2].slice(1)));
								if (needle < minN) {
									if (dir === '-') minN = needle;
									else break findMinMax;
								} else if (needle > maxN) {
									if (dir === '+') maxN = needle;
									else break findMinMax;
								} 
							} else { // break findMinMax; //remove
								if (castonStyle !== 0 || removeComment(info[info.length - 1]) !== carrier) break findMinMax;
								else {
									for (let m = i; m < lines.length; ++m) {
										info = lines[m].trim().split(' ');
										if (info.length > 2) {
											let needle = Number(removeComment(info[2].slice(1)));
											if (info[1] === '+' || info[1] === '-') { 
												if (info[1] === dir || removeComment(info[info.length - 1]) !== carrier) break findMinMax;
												else {
													if (needle < minN) minN = needle;
													if (needle > maxN) maxN = needle;
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}

		width = maxN - minN + 1;
		if (width < 20) {
			minN >= (20 - width) ? ((wasteMin = minN - (20 - width)), (wasteMax = max)) : ((wasteMin = minN), (wasteMax = maxN + (20-width)));
		} else {
			wasteMin = minN;
			wasteMax = maxN;
		}
		let toDrop = [];

		// initialize yarns
		wasteSection.push(`;initialize yarns`);
		for (let i = 0; i < carriers.length; ++i) {
			wasteSection.push(`in ${carriers[i]}`);
			let bed = 'f';
			for (let n = wasteMin; n <= wasteMax; ++n) {
				if (Math.abs(n) % carriers.length === i) {
					wasteSection.push(`tuck + ${bed}${n} ${carriers[i]}`);
					bed === 'f' ? bed = 'b' : bed = 'f';
				} else {
					if (n === wasteMax) wasteSection.push(`miss + ${bed}${n} ${carriers[i]}`);
				}
				if (i === 0) if (n < minN || n > maxN) toDrop.push(n);
			}
			bed = 'b';
			for (let n = wasteMax; n >= wasteMin; --n) {
				if (Math.abs(n) % carriers.length === i) {
					wasteSection.push(`tuck - ${bed}${n} ${carriers[i]}`);
					bed === 'f' ? bed = 'b' : bed = 'f';
				} else {
					if (n === wasteMin) wasteSection.push(`miss - ${bed}${n} ${carriers[i]}`);
				}
			}
			if (negCarriers.includes(carriers[i])) {
				let bed = 'f';
				for (let n = wasteMin; n <= wasteMax; ++n) {
					if (Math.abs(n) % carriers.length === i) {
						wasteSection.push(`tuck + ${bed}${n} ${carriers[i]}`);
						bed === 'f' ? bed = 'b' : bed = 'f';
					} else {
						if (n === wasteMax) wasteSection.push(`miss + ${bed}${n} ${carriers[i]}`);
					}
					if (i === 0) if (n < minN || n > maxN) toDrop.push(n);
				}
			}
		}

		// waste section
		wasteSection.push(`;waste yarn section`);
		for (let p = 0; p < wastePasses; ++p) {
			if (p % 2 === 0) {
				for (let n = wasteMin; n <= wasteMax; ++n) {
					if (n % 2 === 0) {
						wasteSection.push(`knit + f${n} ${wasteCarrier}`);
					} else {
						wasteSection.push(`knit + b${n} ${wasteCarrier}`);
					}
				}
			} else {
				for (let n = wasteMax; n >= wasteMin; --n) {
					if (n % 2 === 0) {
						wasteSection.push(`knit - b${n} ${wasteCarrier}`);
					} else {
						wasteSection.push(`knit - f${n} ${wasteCarrier}`);
					}
				}
			}
		}

		for (let p = 0; p < 12; ++p) {
			if (p % 2 === 0) {
				for (let n = wasteMin; n <= wasteMax; ++n) {
					wasteSection.push(`knit + f${n} ${wasteCarrier}`);
				}
			} else {
				for (let n = wasteMax; n >= wasteMin; --n) {
					wasteSection.push(`knit - b${n} ${wasteCarrier}`);
				}
			}
		}
		if (wasteDir === '+') {
			for (let n = wasteMin; n <= wasteMax; ++n) {
				wasteSection.push(`knit + f${n} ${wasteCarrier}`);
			}
		}

		// drop any extra needles if width < 20
		if (toDrop.length) {
			for (let n = 0; n < toDrop.length; ++n) {
				wasteSection.push(`drop f${toDrop[n]}`);
			}
		}

		// drop all needles on back bed
		for (let n = wasteMin; n <= wasteMax; ++n) {
			wasteSection.push(`drop b${n}`);
		}

		// draw thread
		wasteSection.push(`;draw thread`);
		if (drawDir === '+') {
			for (let n = minN; n <= maxN; ++n) {
				wasteSection.push(`knit + f${n} ${drawCarrier}`);
			}
		} else {
			for (let n = maxN; n >= minN; --n) {
				wasteSection.push(`knit - f${n} ${drawCarrier}`);
			}
		}

		if (castonStyle !== 0) {
			wasteSection.push(`;cast-on`);
			if (castonStyle === 1) {
				wasteSection.push('rack 0.25'); // or 0.5 ? (visualizer)
				if (castonDir === '+') {
					for (let n = minN; n <= maxN; ++n) {
						wasteSection.push(`knit + f${n} ${castonCarrier}`, `knit + b${n} ${castonCarrier}`);
					}
				} else {
					for (let n = maxN; n >= minN; --n) {
						wasteSection.push(`knit - f${n} ${castonCarrier}`, `knit - b${n} ${castonCarrier}`);
					}
				}
				wasteSection.push(`rack 0`);
			} else {
				console.warn('//TODO: add support for other cast-on styles.');
			}
		}

		lines = [...header, ...wasteSection, ...lines];
		lines = lines.join('\n');
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