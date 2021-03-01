# Knitout-to-Kcode Backend

For converting knitout to k-code so that the operations can run on a Kniterate machine.

[Knitout](https://github.com/textiles-lab/knitout) (.k) is a file format that can represent low-level knitting machine instructions in a machine-independent way.\
K-code (.kc) is the file format used for [Kniterate](https://www.kniterate.com/) knitting machines.

<table>
<tr><td><a href="#browser">Running in Browser</a></td><td><a href="#local">Running Locally</a></td><td><a href="#example-code">Example Code</a></td><td><a href="#troubleshooting">Troubleshooting</a></td><td><a href="#resources">Additional Resources</a></td></tr>
</table>

## <a name="browser"></a>Running in Browser

Steps to use the program in a browser.

<b><a name="start">Getting Started</b>  
  
To run the program in a browser, simply:
1. Navigate to [https://textiles-lab.github.io/knitout-backend-kniterate/](https://textiles-lab.github.io/knitout-backend-kniterate/) in your web browser of choice, which serves the files directly from this repository.

(or) 

1. Follow the steps in the [installation](#installation) section.
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

<b><a href="#installation">Installation</a></b>

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

1. Once the repository has been [cloned](#installation) onto your local machine, move the knitout (.k) file you would like to convert to k-code (.kc) into the program's directory (the folder 'knitout-backend-kniterate').
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

## <a name="example-code"></a>Example Code

> **TODO:** add documentation on extensions & quick overview of some example knitout code with its k-code counterpart below

For example files (pairs of file.k [input file] and file.kc [expected output]) see the [test-files](test-files) folder.

## <a name="troubleshooting"></a>Troubleshooting

This program is currently in somewhat of a 'beta-testing' stage, so we anticipate that users will have questions about usage or suggestions for enhancement, and may encounter some bugs. We welcome your feedback and encourage you to reach out via the [Issues](https://github.com/textiles-lab/knitout-backend-kniterate/issues) page.

## <a name="resources"></a>Additional Resources

<b>Live Visualizer</b>

You can use the [knitout live visualizer](https://textiles-lab.github.io/knitout-live-visualizer/) to see a virtual depiction of your knit before running it on the machine (+ live coding support).
