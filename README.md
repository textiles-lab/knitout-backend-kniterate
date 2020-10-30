# knitout-backend-kniterate

Backend to convert knitout to k-code.

[Knitout](https://github.com/textiles-lab/knitout) (.k) is a file format that can represent low-level knitting machine instructions in a machine-independent way.\
K-code (.kc) is the file format for [Kniterate](https://www.kniterate.com/) knitting machines.

<table>
<tr><td><a href="#installation">Installation</a></td><td><a href="#usage">Usage</a></td><td><a href="#dependencies">Dependencies</a></td><td><a href="#troubleshooting">Troubleshooting</a></td></tr>
</table>

## <a name="installation"></a>Installation

In the command line, type:
```console
git clone https://github.com/textiles-lab/knitout-backend-kniterate.git
```
See the github documentation on [cloning a repository](https://docs.github.com/en/free-pro-team@latest/github/creating-cloning-and-archiving-repositories/cloning-a-repository) if you need assistance with installation.

## <a name="usage"></a>Usage

Once the repository has been clone onto your local machine, move the knitout (.k) file you would like to convert to k-code (.kc) into the project's directory (the folder 'knitout-backend-kniterate').\
Once the repository has been clone onto your local machine, navigate to the directory with the command:
```console
cd knitout-backend-kniterate
```
The program takes 3 command-line arguments: 1) the main file name 2) the name of the input knitout file and 3) the name you would like to give the output kniterate file.\
These arguments are proceeded by the engine used to run the program, node. (see [dependencies](#dependencies))
```console
node knitout-to-kcode.js <in.k> <out.kc>
```
Example usage:
```console
node knitout-to-kcode.js test.k test.kc
```
The output k-code file will be saved to the working directory.

## <a name="dependencies"></a>Dependencies

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)

## <a name="troubleshooting"></a>Troubleshooting
If you have any trouble, discover a bug, or want to provide feedback, do not hesitate to use the [Issues](https://github.com/textiles-lab/knitout-backend-kniterate/issues).\
For example files (pairs of knitout [input file] and k-code [expected output]) see the [test-files](test-files) folder.
