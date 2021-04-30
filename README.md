# Knitout-to-Kcode Backend

For converting knitout to k-code so that the operations can run on a Kniterate machine.

[Knitout](https://github.com/textiles-lab/knitout) (.k) is a file format that can represent low-level knitting machine instructions in a machine-independent way.\
K-code (.kc) is the file format used for [Kniterate](https://www.kniterate.com/) knitting machines.

<table>
<tr><td><a href="#browser">Running in Browser</a></td><td><a href="#local">Running Locally</a></td><td><a href="#example-code">Example Code/Knitout Specifications</a></td><td><a href="#troubleshooting">Troubleshooting</a></td><td><a href="#resources">Additional Resources</a></td></tr>
</table>

## <a name="browser"></a>Running in Browser

Steps to use the program in a browser.

<b><a name="start">Getting Started</b>  
  
To run the program in a browser, simply:
1. Navigate to [https://textiles-lab.github.io/knitout-backend-kniterate/](https://textiles-lab.github.io/knitout-backend-kniterate/) in your web browser of choice, which serves the files directly from this repository.

(or) 

1. Follow the steps in the <a href="#installation">installation</a> section.
2. Open the file explorer on your computer and navigate to the directory that you cloned the repository into.
3. There, you'll find a file named [index.html](index.html), which you can open in your web browser of choice to run the program.

<b><a name="browser-use">Usage</b> 
  
1. Click the file-loading prompt under the **Knitout** header.
2. Then, select the knitout file that you'd like to convert to k-code (alternatively, you can just drag the knitout file onto the window to upload it).
3. As the file is loading, information and errors will appear in the **Messages** section.
4. Once the file has finished loading, the name of the output k-code file will appear on the file icon under the **KCode** header.
5. Click the download link to save the file to your computer.

## <a name="local"></a>Running Locally

Steps to use the program locally on your computer.

<b><a name="dependencies"></a>Dependencies</b>

Before cloning the repository, make sure that the following dependencies are installed on your computer:

- [Git](https://git-scm.com/) (for copying the files in this repository to your local computer)
- [Node.js](https://nodejs.org/) (a javascript engine for running the backend via command line)

<b><a name="installation"></a>Installation</b>

1. Open the command line on your computer ('Terminal' if you're running macOS or linux, 'Command Prompt' for windows, or 'Git Bash' if you opted to install it alongside Git).
2. If you would like to install this repository in a particular folder, first change into that directory (with the full path if it's a subdirectory) using the `cd` command:
```console
cd <PATH>/<your-folder>
```
3. Then type:
```console
git clone https://github.com/textiles-lab/knitout-backend-kniterate
```
See the github documentation on [cloning a repository](https://docs.github.com/en/free-pro-team@latest/github/creating-cloning-and-archiving-repositories/cloning-a-repository) if you need assistance with installation.

<b><a name="local-use"></a>Usage</b>

1. Once the repository has been <a href="#installation">cloned</a> onto your local machine, move the knitout (.k) file you would like to convert to k-code (.kc) into the program's directory (the folder 'knitout-backend-kniterate').
2. Then, navigate to the directory with this command:
```console
cd knitout-backend-kniterate
```
3. The program takes 3 command-line arguments: 1) the main file name 2) the name of the input knitout file and 3) the name you would like to give the output kniterate file.\
These arguments are preceded by the engine used to run the program, node. (see [dependencies](#dependencies))
```console
node knitout-to-kcode.js <in.k> <out.kc>
```
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Example usage:
```console
node knitout-to-kcode.js test.k test.kc
```
4. The output k-code file will be saved to the working directory.

## <a name="example-code"></a>Example Code/Knitout Specifications

For example files (pairs of file.k [input file] and file.kc [expected output]) see the [test-files](test-files) folder.

<a name="extensions"></a><b>Knitout Extension for the Kniterate</b>
> **TODO:** add documentation on extensions & quick overview of some example knitout code with its k-code counterpart below


## <a name="troubleshooting"></a>Troubleshooting

This program is currently in somewhat of a 'beta-testing' stage, so we anticipate that users will have questions about usage or suggestions for enhancement, and may encounter some bugs. We welcome your feedback and encourage you to reach out via the [Issues](https://github.com/textiles-lab/knitout-backend-kniterate/issues) page.

## <a name="resources"></a>Additional Resources

<b>Live Visualizer</b>

You can use the [knitout live visualizer](https://textiles-lab.github.io/knitout-live-visualizer/) to see a virtual depiction of your knit before running it on the machine (+ live coding support!).

<b>Extras</b>

Some small, additional programs that help with knitout-kniterate related tasks can be found in the [extras](extras) folder. (*note:* the extras run *separately* from the backend, but the steps for usage are similar [running node along with an input file]). These programs take in a knitout file and output a knitout file as well, so the code they produce is meant to be converted to k-code using the knitout-to-kniterate.js backend before running it on the machine.

So far, here are the 'extras' and how to use them:

1. [waste-section.js](extras/waste-section.js)\
*Description & Usage:*\
Writing out all of the code to produce a waste section is pretty tedious (but also important!), so this program was created to output a customized waste section in knitout automatically (all you have to do is answer a few prompts).
If you are unfamiliar with the purpose of waste sections—the main idea is that, since kniterate machines only have rollers for their take-down mechanism, there is nothing holding your fabric down until the rollers are engaged (which requires a few inches of waste fabric [~70 rows, although this may need to be adjusted if your yarn is particularly thin]). That way, you won't have to worry about dropped stitches/tangled yarn in the actual piece your knitting, and can detatch the waste section when the piece is finished by pulling a draw thread.
- open your terminal and `cd` into the directory where `waste-section.js` lives (`some/path/knitout-backend-kniterate/extras`, if you cloned the repo with the default names/didn't move the file).
- run the command: `node waste-section.js`
- answer the following prompts, pressing the `Enter` key with no input to  (note that this program uses the [readline](https://nodejs.org/api/readline.html) module [which comes built-in with [node](https://nodejs.org/)])
  - 1: Enter the path to the file you'd like to add a waste section to (or press the 'Enter' key with no input the create a waste section without a file)
    - if you opted to create a waste section without a file, enter the minimum and the maximum needle numbers that will be in the first row of the piece you plan to append to the waste section.
  - 2: Enter the values you'd like to assign to the knitout <a href="#extensions">extensions</a> used with the kniterate, as well as the carriers you'd like to use for the waste section and the draw thread (press the 'Enter' key with no input to use the respective default value for any of the prompts)
  - 3: Enter the cast-on style you'd like to use—with the option of entering `0` if the input file already contains a cast-on, and then the carrier to use for the cast-on (again, 'Enter' for the default value)
  - 4: Finally, enter the filename you'd like to give the output knitout file, and then check it out!
2. [knitout-alter-kniterate.js](extras/knitout-alter-kniterate.js)\
*Description & Usage:*\
You might come across a nifty knitout file you'd like to test out (maybe in the [knitout-examples](https://github.com/textiles-lab/knitout-examples) repo, which has a lot of great pre-made knitout files), but if was written for a different machine (chances are, the Shima Seiki SWG series), you'll need to change some things around to make it work on the kniterate. That's where `knitout-alter-kniterate.js` comes in handy! Run this program to automatically change any existing extensions/operations in the file to kniterate-friendly values (and make sure to add on a waste section with [waste-section.js](extras/waste-section.js), if it doesn't already exist). Also, if you want to change any of the carriers used in a particular file to different ones for whatever reason, you can use this program to do that too!
- Just like the program above, open a terminal, `cd` into the directory that contains `knitout-alter-kniterate.js`, and run: `node knitout-alter-kniterate.js`
- Then, answer the following prompts to configure the file (just like the program above too).
3. [half-gauge.js](extras/half-gauge.js)\
*Description & Usage:*\
This program converts full-gauge knitout to half-gauge! Although the kniterate machine doesn't have sliders (a cool feature on the Shima Seiki SWG machines), you can still write knitout that uses them (note that sliders are signified by adding an `s` to the bed parameter in knitout, e.g. `xfer fs1 bs1`), and then run it in `half-gauge.js` to emulate sliders with the empty needles that result from half-gauging.
- Open a terminal, `cd` into the directory that contains `knitout-alter-kniterate.js`, and run: `node half-gauge.js <in-file> <out-file>` (with `<in-file>` being the path to the knitout file you'd like to convert to half-gauge, and `<out-file>` being the filename you'd like to use for the output half-gauged file).
4. [autoknit-kniterate.js](extras/autoknit-kniterate.js)\
*Description & Usage:*\
You may have come across [autoknit](https://github.com/textiles-lab/autoknit), an exciting project by the Textiles Lab that converts 3D meshes to knitout. As of now, autoknit doesn't play too nicely with the kniterate, since the kniterate is lacking some features that make 3D-knitting a bit difficult (e.g. high-level take-down mechanisms [sinkers], consistently reliable transfer-mechanisms [sliders], etc.). With the hope of some day figuring it out, `autoknit-kniterate.js` was created so that autoknit can at least produce files that will safely run on the kniterate (although your [cactus](https://github.com/textiles-lab/autoknit-tests/blob/master/models/misc-cactus.obj) will likely resemble a pile of yarn more than it will the real thing).
- move `autoknit-kniterate.js` into the [node_modules](https://github.com/textiles-lab/autoknit/tree/master/node_modules) folder within autoknit, and once you've gotten to the step where you've produced a javascript file, open that js file in a text-editor and change this line of code [line #1]: `const autoknit = require(autoknit);` to this: `const autoknit = require(autoknit-kniterate);`—and that's it! Just carry on with the rest of the autoknit usage steps.
- See the [autoknit README](https://github.com/textiles-lab/autoknit/blob/master/README.md) for more information about autoknit usage.

The 'extras' are a work-in-progress compilation of resources to expand the possibilities for using knitout with the kniterate machine, so if you have any knitout-kniterate programs/assets that you'd like to contribute, please feel free to submit a pull-request!
