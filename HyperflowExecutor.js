var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

var AWS = require('aws-sdk');
var async = require('async');
var s3 = new AWS.S3({ signatureVersion: 'v4' });
var bucket = 'montage-lambda';
var Promise = require('bluebird');

exports.handler = function (event, context, callback) {
  var printDir = function(p) {
    var fs = require("fs"),
      path = require("path");

    return new Promise(function(resolve, reject) {
      fs.readdir(p, function (err, files) {
        if (err) {
          throw err;
        }

        console.log("Logging all files");

        files.map(function (file) {
          return path.join(p, file);
        }).filter(function (file) {
          return fs.statSync(file).isFile();
        }).forEach(function (file) {
          var stats = fs.statSync(file)
          var fileSizeInBytes = stats["size"]
          //Convert the file size to megabytes (optional)
          var fileSizeInMegabytes = fileSizeInBytes / 1000000.0;

          console.log("%s (%s) (%s)", file, fileSizeInMegabytes, path.extname(file));
        });
        resolve();
      });
    })
  };

  console.log(event);

  json_request = JSON.parse(event.body);

  var executable = json_request.executable;
  var args = json_request.args;
  var inputs = json_request.inputs;
  var outputs = json_request.outputs;

  console.log("Executable: " + executable);
  console.log("Args: " + args);

  var bucket_name = json_request.options.bucket;
  var prefix = json_request.options.prefix;

  var total_start = Date.now();
  var total_end;

  var download_start;
  var execute_start;
  var upload_start;

  console.log('executable: ' + executable);
  console.log('args:       ' + args);
  console.log('inputs:     ' + inputs);
  console.log('inputs[0].name:     ' + inputs[0].name);
  console.log('outputs:    ' + outputs);
  console.log('bucket:     ' + bucket_name);
  console.log('prefix:     ' + prefix);

  function clearTmp(callback) {
    exec('rm ./tmp/*', function (err, stdout, stderr) {
      callback();
    });
  }

  function download(callback) {
    download_start = Date.now();
    async.each(inputs, function (file_name, callback) {
      file_name = file_name.name;
      var full_path = bucket_name + "/" + prefix + "/" + file_name;
      console.log('downloading ' + full_path);

      // Reference an existing bucket.
      var params = {
        Bucket: bucket,
        Key: prefix + '/' + file_name
      };

      var file = require('fs').createWriteStream('./tmp/' + file_name);

      // TODO: Check more efficient way
      // Download a file from your bucket.
      new Promise(function(resolve, reject) {
        s3.getObject(params).
          createReadStream().
            on('end', function() { return resolve(); }).
            on('error', function(error) { return reject(error); }).pipe(file)
      }).then(function(result) {
        console.log("Done");
        callback();
      }, function(err) {
        err['file_name'] = file_name;
        callback(err);
      });
    }, function (err) {
      console.log("Callback!");
      if (err) {
        console.log('A file failed to process ' + err.file_name);
        callback('Error downloading ' + err);
      } else {
        console.log('All files have been downloaded successfully');
        callback();
        // printDir('/tmp').then(function(result) { callback() }, function(err) { callback(err) });
      }
    });
  }


  function execute(callback) {
    execute_start = Date.now();
    var proc_name = __dirname + '/' + executable // use __dirname so we don't need to set env[PATH] and pass env

    console.log('spawning ' + proc_name);
    process.env.PATH = '.:' + __dirname; // add . and __dirname to PATH since e.g. in Montage mDiffFit calls external executables

    var proc = spawn(proc_name, args, {cwd: '/tmp'});

    proc.on('error', function (code) {
      console.error('error!!' + executable + JSON.stringify(code));
//	callback(JSON.stringify(code))
    });

    proc.stdout.on('data', function (exedata) {
      console.log('Stdout: ' + executable + exedata);
    });

    proc.stderr.on('data', function (exedata) {
      console.log('Stderr: ' + executable + exedata);
    });

    proc.on('close', function (code) {
      console.log('Lambda exe close' + executable);
      callback();
      // printDir('/tmp').then(function(result) { callback() }, function(err) { callback(err) });
    });

    proc.on('exit', function (code) {
      console.log('Lambda exe exit' + executable);
    });

  }

  function upload(callback) {
    upload_start = Date.now();
    async.each(outputs, function (file_name, callback) {

      file_name = file_name.name

      var full_path = bucket_name + "/" + prefix + "/" + file_name
      console.log('uploading ' + full_path);

      var fs = require('fs');
      var fileStream = fs.createReadStream('/tmp/' + file_name);
      fileStream.on('error', function (err) {
        if (err) { console.error(err); callback(err); }
      });
      fileStream.on('open', function () {
        var params = {
          Bucket: bucket,
          Key: prefix + '/' + file_name,
          Body: fileStream
        };

        s3.putObject(params, function (err) {
          if (err) {
            console.error("Error uploading file " + full_path);
            console.error(err);
            callback(err);
          } else {
            console.log("Uploaded file " + full_path);
            callback();
          }
        });
      });

    }, function (err) {
      if (err) {
        console.error('A file failed to process');
        callback('Error uploading')
      } else {
        console.log('All files have been uploaded successfully');
        callback()
      }
    });
  }

  async.waterfall([
    clearTmp,
    download,
    execute,
    upload
  ], function (err, result) {
    var response;
    if (err) {
      response = {
        statusCode: '400',
        body: JSON.stringify({message: err}),
        headers: {
          'Content-Type': 'application/json'
        }
      };
    } else {
      console.log('Success');
      total_end = Date.now();

      var duration = total_end - total_start;
      var download_duration = execute_start - download_start;
      var execution_duration = upload_start - execute_start;
      var upload_duration = total_end - upload_start;

      var message = 'AWS Lambda Function exit: start ' + total_start + ' end ' + total_end + ' duration ' + duration + ' ms, executable: ' + executable + ' args: ' + args;
      message += ' download time: ' + download_duration + ' ms, execution time: ' + execution_duration + ' ms, upload time ' + upload_duration + ' ms';

      var body = {
        message: message,
        duration: duration,
        executable: executable,
        args: args,
        download_duration: download_duration,
        execution_duration: execution_duration,
        upload_duration: upload_duration
      };

      response = {
        statusCode: '200',
        body: message,//JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json'
        }
      };
      console.log(response);
    }

    console.log(response);
    context.succeed(response);
  })
};
