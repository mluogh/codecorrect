/*
        *File: DockerSandbox.js
        *Author: Osman Ali Mian/Asad Memon
        *Created: 3rd June 2014
        *Revised on: 25th June 2014 (Added folder mount permission and changed executing user to nobody using -u argument)
        *Revised on: 30th June 2014 (Changed the way errors are logged on console, added language name into error messages)
*/


/**
         * @Constructor
         * @variable DockerSandbox
         * @description This constructor stores all the arguments needed to prepare and execute a Docker Sandbox
         * @param {Number} timeout_value: The Time_out limit for code execution in Docker
         * @param {String} path: The current working directory where the current API folder is kept
         * @param {String} folder: The name of the folder that would be mounted/shared with Docker container, this will be concatenated with path
         * @param {String} vm_name: The TAG of the Docker VM that we wish to execute
         * @param {String} compiler: The compiler/interpretor to use for carrying out the translation
         * @param {String} compileTarget: The compileTarget to which source code will be written
         * @param {String} code: The actual code
         * @param {String} runTarget: Used in case of compilers only, to execute the object code, send " " in case of interpretors
*/

var compilerInfo = require('./compilers').compilerInfo;

var DockerSandbox = function(timeout_value, path, folder, vm_name, language, code, stdin_data)
{

    this.timeout_value=timeout_value;
    this.path=path;
    this.folder=folder;
    this.vm_name=vm_name;
    this.code = code;
    this.stdin_data=stdin_data;

    this.compiler = compilerInfo[language].compiler;
    this.compileTarget = compilerInfo[language].compileTarget;
    this.runTarget = compilerInfo[language].runTarget;
    this.langName = compilerInfo[language].language;
    this.runtimeArgs = compilerInfo[language].runtimeArgs;
}


/**
         * @function
         * @name DockerSandbox.run
         * @description Function that first prepares the Docker environment and then executes the Docker sandbox 
         * @param {Function pointer} success ?????
*/
DockerSandbox.prototype.run = function(success) 
{
    var sandbox = this;

    this.prepare(function(){
        sandbox.execute(success);
    });
}


/*
         * @function
         * @name DockerSandbox.prepare
         * @description Function that creates a directory with the folder name already provided through constructor
         * and then copies contents of folder named Payload to the created folder, this newly created folder will be mounted
         * on the Docker Container. A file with the name specified in compileTarget variable of this class is created and all the
         * code written in 'code' variable of this class is copied into this file.
         * Summary: This function produces a folder that contains the source file and 2 scripts, this folder is mounted to our
         * Docker container when we run it.
         * @param {Function pointer} success ?????
*/
DockerSandbox.prototype.prepare = function(success)
{
    var exec = require('child_process').exec;
    var fs = require('fs');
    var async = require('async');
    var sandbox = this;

    //Edit this to do it once for every file
    console.log('Make Directory \n' + "mkdir "+ this.path+this.folder + " && cp "+this.path+"/Payload/* "+this.path+this.folder+"&& chmod 777 "+ this.path+this.folder)

    exec("mkdir "+ this.path+this.folder + " && cp "+this.path+"/Payload/* "+this.path+this.folder+"&& chmod 777 "+ this.path+this.folder, function(st){

        //Make a file for each class/piece of code
        async.each(Object.keys(sandbox.code), function(file, callback){
            //get the file extension to make the file
            var fileExt = sandbox.compileTarget.substring(sandbox.compileTarget.indexOf('.'), sandbox.compileTarget.length);

            fs.writeFile(sandbox.path + sandbox.folder+"/" + file + fileExt, sandbox.code[file], function(err){
                console.log(file + fileExt);
                console.log(sandbox.code[file])
                callback(err);
            });
        }, function(err){
            if (err) 
            {
                console.log(err);
            }    
            else
            {
                exec("chmod 777 \'"+sandbox.path+sandbox.folder+"/"+sandbox.compileTarget+"\'")

                fs.writeFile(sandbox.path + sandbox.folder+"/inputFile", sandbox.stdin_data, function(err) 
                {
                    if (err) 
                    {
                        console.log(err);
                    }    
                    else
                    {
                        console.log("Input file was saved!");
                        success();
                    } 
                });
            } 
        });
    });
}

/*
         * @function
         * @name DockerSandbox.execute
         * @precondition: DockerSandbox.prepare() has successfully completed
         * @description: This function takes the newly created folder prepared by DockerSandbox.prepare() and spawns a Docker container
         * with the folder mounted inside the container with the name '/usercode/' and calls the script.sh file present in that folder
         * to carry out the compilation. The Sandbox is spawned ASYNCHRONOUSLY and is supervised for a timeout limit specified in timeout_limit
         * variable in this class. This function keeps checking for the file "Completed" until the file is created by script.sh or the timeout occurs
         * In case of timeout an error message is returned back, otherwise the contents of the file (which could be the program output or log of 
         * compilation error) is returned. In the end the function deletes the temporary folder and exits
         * 
         * Summary: Run the Docker container and execute script.sh inside it. Return the output generated and delete the mounted folder
         *
         * @param {Function pointer} success ?????
*/

DockerSandbox.prototype.execute = function(success){
    var exec = require('child_process').exec;
    var fs = require('fs');
    var myC = 0; //variable to enforce the timeout_value
    var sandbox = this;

    //this statement is what is executed
    var st = this.path+'DockerTimeout.sh ' + this.timeout_value + 's -i -t -v  "' + this.path + this.folder + '":/usercode ' + this.vm_name + ' /usercode/script.sh ' + this.compiler + ' ' + this.compileTarget + ' ' + this.runTarget+ ' ' + this.runtimeArgs;
    
    //log the statement in console
    console.log('Docker Run \n' +st);

    //execute the Docker, This is done ASYNCHRONOUSLY
    exec(st, function(err, stdout){
	console.log("STDOUT");
	console.log(stdout);
	});
    console.log("------------------------------")
    //Check For File named "completed" after every 1 second
    var intid = setInterval(function() {
        //Displaying the checking message after 1 second interval, testing purposes only
        //console.log("Checking " + sandbox.path+sandbox.folder + ": for completion: " + myC);

        myC = myC + 1;
		
        fs.readFile(sandbox.path + sandbox.folder + '/completed', 'utf8', function(err, data) {
            
            //if file is not available yet and the file interval is not yet up carry on
            if (err && myC < sandbox.timeout_value) 
            {
                //console.log(err);
                return;
            } 
            //if file is found simply display a message and proceed
            else if (myC < sandbox.timeout_value) 
            {
                console.log("DONE")
                //check for possible errors
                fs.readFile(sandbox.path + sandbox.folder + '/errors', 'utf8', function(err2, data2) 
                {

                	if(!data2) data2=""
               		console.log("Error file: ")
               		console.log(data2)

               		console.log("Main File")
               		console.log(data)

        			var lines = data.toString().split('*-COMPILEBOX::ENDOFOUTPUT-*')
        			data=lines[0]
        			var time=lines[1]

        			console.log("Time: ")
        			console.log(time)


       	           	success(data,time,data2)
                });

                //return the data to the calling functoin
            	
            } 
            //if time is up. Save an error message to the data variable
            else 
            {
            	//Since the time is up, we take the partial output and return it.
            	fs.readFile(sandbox.path + sandbox.folder + '/logfile.txt', 'utf8', function(err, data){
            		if (!data) data = "";
                    data += "\nExecution Timed Out";
                    console.log("Timed Out: "+sandbox.folder+" "+sandbox.langName)
                    fs.readFile(sandbox.path + sandbox.folder + '/errors', 'utf8', function(err2, data2) 
                    {
                    	if(!data2) data2=""

    			var lines = data.toString().split('*---*')
    			data=lines[0]
    			var time=lines[1]

    			console.log("Time: ")
    			console.log(time)

                       	success(data,data2)
                    });
            	});
                
            }

            //now remove the temporary directory
            console.log("ATTEMPTING TO REMOVE: " + sandbox.folder);
            console.log("------------------------------")
            exec("rm -r " + sandbox.folder);
            
            clearInterval(intid);
        });

    }, 1000);
}


module.exports = DockerSandbox;