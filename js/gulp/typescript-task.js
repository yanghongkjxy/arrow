// Licensed to the Apache Software Foundation (ASF) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The ASF licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

const {
    targetDir, tsconfigName, observableFromStreams
} = require('./util');

const del = require('del');
const gulp = require('gulp');
const path = require('path');
const ts = require(`gulp-typescript`);
const gulpRename = require(`gulp-rename`);
const sourcemaps = require('gulp-sourcemaps');
const { memoizeTask } = require('./memoize-task');
const { Observable, ReplaySubject } = require('rxjs');

const typescriptTask = ((cache) => memoizeTask(cache, function typescript(target, format) {
    const out = targetDir(target, format);
    const tsconfigPath = path.join(`tsconfig`, `tsconfig.${tsconfigName(target, format)}.json`);
    return compileTypescript(out, tsconfigPath)
        .merge(compileBinFiles(target, format)).takeLast(1)
        .concat(maybeCopyRawJSArrowFormatFiles(target, format))
        .publish(new ReplaySubject()).refCount();
}))({});

function compileBinFiles(target, format) {
    const out = targetDir(target, format);
    const tsconfigPath = path.join(`tsconfig`, `tsconfig.${tsconfigName('bin', 'cjs')}.json`);
    return compileTypescript(path.join(out, 'bin'), tsconfigPath);
}

function compileTypescript(out, tsconfigPath) {
    const tsProject = ts.createProject(tsconfigPath, { typescript: require(`typescript`) });
    const { stream: { js, dts } } = observableFromStreams(
      tsProject.src(), sourcemaps.init(),
      tsProject(ts.reporter.defaultReporter())
    );
    const writeDTypes = observableFromStreams(dts, gulp.dest(out));
    const writeJS = observableFromStreams(js, sourcemaps.write(), gulp.dest(out));
    return Observable.forkJoin(writeDTypes, writeJS);
}

module.exports = typescriptTask;
module.exports.typescriptTask = typescriptTask;
module.exports.compileBinFiles = compileBinFiles;

function maybeCopyRawJSArrowFormatFiles(target, format) {
    if (target !== `es5` || format !== `cls`) {
        return Observable.empty();
    }
    return Observable.defer(async () => {
        const outFormatDir = path.join(targetDir(target, format), `fb`);
        await del(path.join(outFormatDir, '*.js'));
        await observableFromStreams(
            gulp.src(path.join(`src`, `fb`, `*_generated.js`)),
            gulpRename((p) => { p.basename = p.basename.replace(`_generated`, ``); }),
            gulp.dest(outFormatDir)
        ).toPromise();
    });
}
