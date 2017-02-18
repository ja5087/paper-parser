# paper-parser


## prereqs
Please make sure to have installed:

1. opencv (2.4) according to [node_opencv](https://github.com/peterbraden/node-opencv) and set OPENCV\_DIR and PATH=%OPENCV\_DIR%\bin properly
2. [tesseract](https://github.com/tesseract-ocr/tesseract) (latest) and set TESSDATA_PREFIX to /tessdata where you installed it
3. [cpdf](http://community.coherentpdf.com/) (latest) 
4. [ImageMagick](https://www.imagemagick.org/script/binary-releases.php) + Legacy Tools (convert)

## usage

1. install using npm install for a private github
2. ```var paperparser = require('paper-parser')```
3. ```paperparser()``` everytime you want to complete rebuild (because there's no checking for existing files soz);



Parses all PDFs in /input as IB Maths Papers

Dirty I know.

Doesn't work on some questions.

Tested to work on basically nothing.

Will output images in folder structure:

/static/year/group/subject/paper/language/timezone

Example:

__dirname/static/M13/5/MATME/SP2/ENG/TZ1