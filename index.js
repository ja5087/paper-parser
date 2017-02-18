var fs = require('fs');
var cv = require('opencv');
var stream = require('stream');
var path = require('path');
var queue = require('de-async');
var exec = require('child_process').exec;
var execp = require('child-process-promise').exec;
var mkdirp = require('mkdirp');



const STATIC_PATH_DIR = 'static';

var _IMAGEMAGICK_PATH, _CPDF_PATH, _TESSERACT_PATH


function generatePaperProps(propsArray)
{
    var properties = {
        year: null,
        group: null,
        subject: null,
        paper: null,
        language: null,
        timezone: null,
        question: null,
        option: null

    };

    console.log("propsarray is: " +propsArray);

    //we encode the object directly until it errors


    //we need to parse properties (defined by filesystem structure). It's tight
    // M16/5/MATHL/HP1/ENG/TZ1/FILE
    // something something Year / Group / Subject / S or H Paper Number / Language / Time zone / FILENAME OR OPTION // FILENAME
    //         0            1        2     3               4                    5        6         7                       8
    //note that 0 represents the root folder of papers hosted (usually '\papers')
    //note that option may not exist in some cases

    //we try to encode the necessary values first (all papers guaranteed to have unless maaajor error)
    try 
    {
        properties.year = propsArray[1];
        properties.group = propsArray[2];
        properties.subject = propsArray[3];
        properties.paper = propsArray[4];
        properties.language = propsArray[5];
        properties.timezone = propsArray[6];

    } catch(e) {
        console.log("Directory error! Please make sure you stick to folder naming spec. Directory parsed was " 
        + propsArray);
    }


    if(propsArray[7].search(".png") > 0)
    {
        //that means that 7 is the filename
        properties.question = parseInt(propsArray[7].replace(".png",""));
    } else {
        //otherwise we must have 7 as option and 8 as filename
        properties.option = propsArray[7];
        if(propsArray.length>8)
        properties.question = parseInt(propsArray[8].replace(".png",""));


    }
    

    return properties;
}

function opencv(buf, cb)
{
    console.log("began ocv task");
    //WE USE A VERY SICK STRATEGY TO DO THIS
    /*
    var fileName = path.join(process.cwd(),'raw_papers','m15_tz2_hl.png');
        console.log("fikanem is:"+fileName);
        */
    cv.readImage(buf, function(err, omat)
    {
        if(err==null)
        {

            //lazy coding: crop an image using premeasured values
            //we cut 5% off top and bottom
            var width5 = omat.width() * 0.05;
            var height5 = omat.height() * 0.05;
            omat = omat.crop(width5, height5, omat.width()-width5*2, omat.height()-height5*2);
            omat.save('./input.png');

            var orig = omat.clone();
           
            //now attempting to detect contours
            console.log("we read in the image");
            var mat = new cv.Matrix(omat.height(),omat.width());
            omat.convertGrayscale();
            omat.threshold(100,255,"Binary");
            

            //invert the image as to properly ocr it
            omat.bitwiseNot(omat);
            
            //findcontours is a destructive operation so make a clone first
            var mat = omat.clone();
            //mat.save("./prettysave.png");
            var contours = mat.findContours();
            
            //iterate and draw bounding rects of all contours
            
            /*
            for(var i = 0; i < contours.size(); i++)
            {
                //console.log("Drawing Contour:"+i);
                //draw the bounding rectangular lines:
                var br = contours.boundingRect(i);
                //console.log(br);

                mat.line([br.x,br.y],[br.x+br.width,br.y],[255,255,255]);
                mat.line([br.x,br.y],[br.x,br.y+br.height],[255,255,255]);
                mat.line([br.x+br.width,br.y],[br.x+br.width,br.y+br.height],[255,255,255]);
                mat.line([br.x,br.y+br.height],[br.x+br.width,br.y+br.height],[255,255,255]);
            }*/

            //flatten along y into array of line heights
            var flatArray = [];
            
            //the schwinn algorithm for unionizing segments
            //we flatten image on y axis
            for(var i = 0; i < contours.size(); i++)
            {
                var br = contours.boundingRect(i);
                
                    flatArray.push([br.y,-1]); //top bound
                    flatArray.push([br.y+br.height,1]); //bottom bound
                
            }

            //now sort the flatArray
            flatArray.sort(function(a,b)
            {
                return a[0]-b[0];
            });
            //console.log(flatArray);
            //now we find new segments from that sorted array




            var lines = [];
            var tracking = false;
            var sum = 0;
            var min=0,max=0;
            //var scount = 0, ecount = 0;
            //console.log("size of flatarray" +flatArray.size);


            //tfw ur code works and u dont know why
            //sums idx 1 of array and restarts tracking everytime we hit 0
            for(var i = 0; i < flatArray.length;i++)
            {
                //console.log("begin unionizing");

                if(sum==0 && tracking==false)
                {
                    tracking=true;
                    //console.log("began tracking");
                    min = flatArray[i][0];
                    //scount++;
                }  
                
                sum+=flatArray[i][1];

                if (sum==0 && tracking==true)
                {
                    tracking = false;
                    max = flatArray[i][0];
                    //console.log("ended tracking");
                    lines.push([min,max]);

                    //ecount++;
                } 
                

            
            }
            //console.log("scount vs ecount" + scount + " " + ecount);
            //console.log(lines);

            //debug stuff
            
            for(var i = 0; i<lines.length;i++)
            {
                 mat.line([0,lines[i][0]],[1200,lines[i][0]],[255,255,255]);
                 mat.line([0,lines[i][1]],[1200,lines[i][1]],[128,255,255]);
            }
            //console.log(flatArray);
            //console.log("first and last: " + flatArray[0][0] + " : " + flatArray[flatArray.length-1][0] );
            mat.line([1100,flatArray[0][0]],[1100,flatArray[flatArray.length-1][0]],[255,255,255]);
            


        }





            //mat.line([0,0],[500,500],[255,255,255]);
            mat.save('./output.png');
            console.log('contours saved!');




            //cropping

            var tess_recog_array = [];
            //we use a dimensions array to store only the things that passed the filter
            var tess_dimensions_array = [];
            for(var i = 0; i < lines.length; i++)
            {
                if(
                    lines[i][1]-lines[i][0]<orig.height()*0.3 //if its larger than a third of the page its not a line
                &&  lines[i][0]<orig.height()*0.8                 //cuts out the barcode
                
                )
                {
                var crop = orig.clone();
                crop = crop.crop(0, lines[i][0],crop.width() , lines[i][1]-lines[i][0]);
                console.log("cropped line " + i); 
                var im_buff = crop.toBuffer();
                var im_stream = new stream.PassThrough();

                im_stream.end(im_buff);
                var im_promise = execp(_TESSERACT_PATH + " stdin stdout -psm 7", {env: process.env, stdio: ['pipe', 'pipe', 'pipe']} );
                im_stream.pipe(im_promise.childProcess.stdin);



                tess_recog_array.push(im_promise);
                tess_dimensions_array.push({
                    width: orig.width(),
                    x:0,
                    y:lines[i][0],
                    height: lines[i][1] - lines[i][0]
                });
                //console.log(im_buff);
                //tesseract_recognize(im_buff,""); //recognize in parallel then we can use promises to resolve
                

                } 
            }

            //resolve the recogArray sequentially
            //I LOVE WRITING ASYNC CODE TO MAKE IT SYNCED
            var tess_result_array = [];
            Promise.all(tess_recog_array).then(function(result)
            {
                result.forEach(function(res,i)
                {
                    tess_result_array.push({
                        text:res.stdout,
                        x: 0,
                        y: tess_dimensions_array[i].y,
                        width: tess_dimensions_array[i].width,
                        height: tess_dimensions_array[i].height
                    });
                });

                //console.log("tess recog array");
                //console.log(result);


                console.log("tess result array");
                console.log(tess_result_array);

                //search for "1. [Maximum mark: 4]" using regex

                var minX = -1;
                var maxX = 0;
                var minY = -1;
                var maxY = 0;
                var qnum = 0;

                var pprops = {};
                tess_result_array.forEach(function(res,i)
                {
                    var Qmatches = res.text.match(/(\d{1,2})..\[(?:Maximum|Total) mark:.{1,3}\]/);
                    var PTypematches = res.text.match(/([M|N].{2,3}\/.\/[A-Z]*\/[A-Z]*.\/[A-Z]*\/[A-Z]*..\/[A-Z]*)/);
                    
                    //console.log(Qmatches);
                    

                    if(PTypematches!==null)
                    {
                        //detect paper type using preexisting code
                        console.log("p types matched");

                        //note to self: I padded this using unshift bc of genppprops needs 0 to be something
                        var matched = PTypematches[1].split("/");
                        matched.unshift("test");
                        pprops = generatePaperProps(matched);


                        //FOLLOWING IS A LIST OF HACKS TO SAVE TIME
                        if(pprops.timezone=='TZZ')
                        {
                            pprops.timezone='TZ2';
                        }

                        if(pprops.timezone=='TZO')
                        {
                            pprops.timezone='TZ0';
                        }

                        if(pprops.timezone=='TZI')
                        {
                            pprops.timezone='TZ1';
                        }

                        if(pprops.timezone=='TZ l')
                        {
                            pprops.timezone='TZ1';
                        }

                        if(pprops.timezone=='TZl')
                        {
                            pprops.timezone='TZ1';
                        }

                        pprops.year = pprops.year.replace(' ','');
                        pprops.year = pprops.year.replace('O','0');
                        pprops.year = pprops.year.replace('Z','2');

                        pprops.paper = pprops.paper.replace('l','1');
                        pprops.paper = pprops.paper.replace('Z','2');
                        
                        pprops.group = pprops.group.replace('S','5');
                    }


                    if(Qmatches!==null)
                    {
                        pprops.qnum = Qmatches[1];
                        minX = res.x;
                        minY = res.y;
                        
                    }


                    
                });
                console.log(pprops);
                
                //for now we assume one question per page and set end to the last item
                if(!(minX==-1||minY==-1))
                {
                        
                    var lastItem = tess_result_array[tess_result_array.length-1];
                    maxX = lastItem.width;
                    maxY = lastItem.y+lastItem.height;
                    //console.log("lastItem");
                    //console.dir(lastItem);
                    //now crop the image
                    var qcrop = orig.clone();

                    console.log("cropping parameters");
                    console.log("" + minX + " " + minY + " " + (maxX-minX) + " " + (maxY-minY));


                    
                    if(minY!=0)
                    {
                    qcrop = qcrop.crop(minX, minY-50, maxX-minX, maxY-minY+80); //LOL FUCK ME CROP ISNT A DESTRUCTIVE FUNCTION.
                    } else {
                        qcrop = qcrop.crop(minX, minY, maxX-minX, maxY-minY+80); //LOL FUCK ME CROP ISNT A DESTRUCTIVE FUNCTION.
                    }

                    console.log("saved q");
                    qcrop.save("./saved q.png");

                    console.log("saved props");
                    console.dir(pprops);
                    var propsavedir = path.join(
                            process.cwd(),
                            STATIC_PATH_DIR,
                            "papers",
                            pprops.year,
                            pprops.group,
                            pprops.subject,
                            pprops.paper,
                            pprops.language,
                            pprops.timezone
                        );
                    

                    //because opencv cannot create folders:
                    if(!fs.existsSync(propsavedir))
                    {
                        mkdirp.sync(propsavedir);
                    }
                    qcrop.save(
                        path.join(propsavedir,padint(pprops.qnum,2)+".png")
                    );

                    console.log("proper save path: " + propsavedir);
                    //attempt to save to a proper context

                } else {
                    //this means we havent found a suitable match
                    //do nothing
                    console.log("found no q's, did nothing");
                }

                cb("succeeded");



            }).catch(function(reject)
            {
                console.log("promise rejected");
                console.log(reject);
                cb("failed");
            });
                


        }
    )};


//opencv(); THIS RUNS THE OPENCV IMAGE


function padint(num, digits)
{
    //returns a string of int padded
    var str = num+"";
    for(var i = 0; i<digits-str.length;i++)
    {
        str = "0"+str;
    }
    return str;
}

function pdf_to_png(src, file_cb)
{
    //var pdf_file = new Uint8Array(fs.readFileSync(src));
    //console.log("pdf file" + pdf_file);

    
    //use magick to convert pdf to png 
    //bit depth must be 8 b ecause opencv is picky
    var i = 0;

    var pdfQueue = new queue(4,file_cb);
    
    console.log("began pdftask");
    if(src.indexOf(".pdf")>0)
    {
        exec(_CPDF_PATH + " -pages "+ "\"" + src + "\"", function(error, stdout, stderr) {
            if(error) console.log("error:"+error);
            var pnums = parseInt(stdout);
            console.log("pnums: " + pnums);


            var conversionQueue = new queue(2,pdfQueue.begin);
            
            for(var i = 1; i < pnums; i++) //skip initial page
            {
                conversionQueue.push(
                    
                    
                exec.bind(null,
                    
                    _IMAGEMAGICK_PATH + " -depth 8 -background white -alpha remove -density 300 "+ "\"" + src + "[" + i + "]" + "\"" + " png:-",
                    
                    {encoding:'buffer', maxBuffer: 1000000}

                    
                ),

                function(error, stdout, stderr)
                    {
                    if(error)
                    {
                        console.log("magick error:" + error);
                    }
                    //console.log(stdout);
                    console.log("pushed page");
                    pdfQueue.push(opencv.bind(null,stdout));
                    }
                
            
                );
                console.log("pushed convq");
            }

            conversionQueue.begin();
            
        });
    } else {
        file_cb();
    }

}


    
//read in the files

function buildImageDataBase(imagemagick_path, tesseract_path, cpdf_path)
{
_IMAGEMAGICK_PATH = cpdf_path || "\"C:\\Program Files\\ImageMagick-7.0.4-Q16\\convert.exe\"";
_TESSERACT_PATH = tesseract_path || "D:\\TesseractOCR\\Tesseract-OCR\\tesseract.exe";
_CPDF_PATH = imagemagick_path || "D:\\cpdf\\cpdf.exe";





var fileQueue = new queue(1, function(err) {
    if(!err)
    {
    console.log("success");
    } else {
        console.log("errored: " + err);
    }
});

fs.readdir(path.join(process.cwd(),"input"),function(err, files)
{
    if(typeof files !== 'undefined')
    {
        for(var i = 0; i < files.length; i++)
        {   
            console.log("reading file :" + path.join(process.cwd(),"input",files[i]));

            //push to queue bound with args

            fileQueue.push(pdf_to_png.bind(null,path.join(process.cwd(),"input",files[i])));
        }
    } else {
    throw new Error("Error in reading files: " + err);
}
    fileQueue.begin();
});
}


module.exports = buildImageDataBase;