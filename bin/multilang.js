"use strict";

var _ = require("lodash");
var yaml = require('js-yaml');
var fs = require('fs-promise');
var stripBom = require('strip-bom');
var Promise = require('promise');

// locals
// matches: m[1]: LB, m[2]: lang, m[3]: RB
var reLangSec=/([<\[])!--lang:(.*)--([>\]])/;
var imgUrl = 'https://github.com/codenautas/multilang/blob/master/img/';

var multilang={}

multilang.defLang='en';

multilang.langs={
    en:{
        name: 'English',
        abr: 'en',
        languages:{
            en: 'English',
            es: 'Spanish',
            it: 'Italian',
            ru: 'Russian'
        },
        phrases:{
            language: 'language',
            'also available in': 'also available in',
            'DO NOT MODIFY DIRECTLY': 'DO NOT MODIFY DIRECTLY THIS FILE WAS GENERATED BY multilang.js'
        }
    }
}

// esto se va a inicializar con los yaml de ./langs/lang-*.yaml
multilang.changeDoc=function changeDoc(documentText,lang){
    var obtainedLangs=this.obtainLangs(documentText);
    lang = lang ? lang : this.defLang;
    var langConv = this.parseLang(lang);
    var buttonSection=this.generateButtons(obtainedLangs,lang);
    var parts=this.splitDoc(documentText);
    return parts.map(function(part){
        if('special' in part) switch(part.special){
            case 'header':
                return (part.withBom?'\ufeff':'')+'<!-- \n\n\n\n\n'
                    +langConv.phrases['DO NOT MODIFY DIRECTLY']
                    +'\n\n\n\n\n-->\n'
            case 'buttons':
                return buttonSection+ '\n\n';
            default:
                throw new Error('multilang.changeDoc special part not recognized '+part.special);
        } else {
            if(part.all || part.langs[lang]){
                return part.text;
            }
            return '';
        }
    }).join('');
}

multilang.obtainLangs=function obtainLangs(docHeader){
    var all_langs = {};
    var def_lang = null; 
    var langs = /<!--multilang v[0-9]+\s+(.+)(-->)/.exec(docHeader);
    if(langs) {
        var lang_re = /([a-z]{2}):([^.]+\.(md|html))/g;
        var lang;
        while(null != (lang = lang_re.exec(langs[1]))) {
            if(null == def_lang) { def_lang = lang[1]; }
            all_langs[lang[1]] = {'fileName' : lang[2] };
        }
    }
    return {main:def_lang, langs:all_langs};
}

multilang.generateButtons=function generateButtons(docHeader,lang) {
    var obtainedLangs = docHeader.main && docHeader.langs ?
                            docHeader :
                            this.obtainLangs(docHeader);
    if(null == this.langs[lang]) { this.langs[lang] = this.parseLang(lang); }
    var ln = _.merge({}, this.langs[this.defLang], this.langs[lang]); 
    var r='<!--multilang buttons-->\n';
    r += ln.phrases.language+': !['+ln.name+']('+imgUrl+'lang-'+ln.abr+'.png)\n';
    r += ln.phrases['also available in']+':';
    var gotToStrip=false;
    for(var lother in obtainedLangs.langs) {
        if(lother == lang) { continue; } 
        gotToStrip=true;
        var lname = ln.languages[lother];
        r += '\n[!['+lname+']('+imgUrl+'lang-'+lother+'.png)]('+obtainedLangs.langs[lother].fileName+') -';
    }
    if(gotToStrip) { r = r.substring(0, r.length-2); }
    return r;
}

multilang.splitDoc=function splitDoc(documentText){
    var r = [];
    r.push({special:'header', withBom:'\uFEFF'==documentText.substring(0, 1)});
    var doc = r[0].withBom ? documentText.substring(1) : documentText;
    var docLines = doc.split("\n");
    var inButtons=false;
    var inTextual=false;
    var inLang=false;
    for(var ln=0; ln<docLines.length; ++ln) {
        var line=docLines[ln].replace(/([\t\r ]*)$/g,''); // right trim ws
        if(line.match("```")) { inTextual = !inTextual; }
        if(!inButtons) {
            var m=line.match(/^(<!--multilang (.*)(-->)+)/);
            if(m){
                if("buttons"==m[2]) {
                    r.push({special:m[2]});
                    inButtons=true;
                }
            } else {
                m = !inTextual && line.match(reLangSec);
                if(m) {
                    inLang = true;
                    if("*" != m[2]) {
                        var langs = m[2].split(",");
                        var okLangs = {};
                        for(var l=0; l<langs.length; ++l) {
                            okLangs[langs[l]] = true;
                        }
                        r.push({'langs': okLangs});                        
                    } else {
                        r.push({'all': true});
                    }
                    r[r.length-1].text = '';
                    continue;
                } else {
                    if(!inButtons && !inLang && ""!=line) {
                        r.push({all:true, text: docLines[ln]+'\n'});
                    }
                }
            }
        }
        if(inButtons) {
            if(""==line) {
                inButtons = false;
            }
        } else if(inLang) {
            r[r.length-1].text += docLines[ln];
            if(ln != docLines.length-1) { r[r.length-1].text +='\n'; }
        }
    }
    return r;
}

multilang.parseLang=function parseLang(lang){
    if(this.langs[lang]){
        var theLang=this.langs[lang];
    }else{
        var langFile = './langs/lang-'+lang+'.yaml';
        theLang=yaml.safeLoad(stripBom(fs.readFileSync(langFile, 'utf8')));
    }
    return _.merge({}, this.langs[this.defLang], theLang)
}

multilang.getWarningsLangDirective=function getWarningsLangDirective(doc){
    var obtainedLangs=this.obtainLangs(doc);
    var obtainedLangsKeys = Object.keys(obtainedLangs.langs);
    var warns=[];
    var docLines = doc.split("\n");
    var firstSectionFound=false;
    var foundLangs=[];
    var prevLang="";
    var inCode = false;
    var ln=0;
    for(  ; ln<docLines.length; ++ln) {
        var line=docLines[ln].replace(/([\t\r ]*)$/g,''); // right trim ws
        if(line.match(/^(```)$/)) { inCode = !inCode; }
        if(!inCode) {
            var m=line.match(reLangSec);
            if(m) {
                foundLangs.push(m[2]);
                if(!firstSectionFound && '['== m[1]) {
                    warns.push({line: ln+1, text: 'unbalanced start "["' });
                }
                if(m[3]=='>') { // must have all languages
                    for(var lp in obtainedLangs.langs) {
                        var lang = obtainedLangs.langs[lp];
                        if(-1==foundLangs.indexOf(lp)) {
                            warns.push({line: ln+1, text: 'missing section for lang %', params: [lp]});
                        }
                    }
                    foundLangs=[obtainedLangs.main];
                    firstSectionFound=false;
                }
                if("*" == m[2]) {
                    if(prevLang != "*") {
                        warns.push({line: ln+1, text: 'lang:* must be after other lang:* or after last lang section (%)',
                                    params: [obtainedLangsKeys[obtainedLangsKeys.length-1]] });
                    }
                    if(">" != m[3]) {
                        warns.push({line: ln+1, text: 'lang:* must end with ">"'});
                    }
                }
                if(obtainedLangs.main == m[2] && ">" != m[3]) {
                    warns.push({line: ln+1, text: 'main lang must end with ">" (lang:%)', params: [obtainedLangs.main]});
                }
                if(obtainedLangsKeys[obtainedLangsKeys.length-1] == m[2]
                   && m[1]=="<"
                   && ">" != m[3])
                {
                    warns.push({line: ln+1, text: 'unbalanced \"<\"'});
                }
                if("*" != m[2] && -1 == obtainedLangsKeys.indexOf(m[2])) {
                    warns.push({line: ln+1, text: 'lang:% not included in the header', params: [m[2]]});
                }
                firstSectionFound=true;
                prevLang = m[2];

                } else { // in language body
                // check for lang clause
                if(line.match(/--lang:(.*)--/)) {
                    warns.push({line: ln+1, text: 'lang clause must not be included in text line'});
                }
            }
        }
    }
    // check missing langs
    for(var lp in obtainedLangs.langs) {
        var lang = obtainedLangs.langs[lp];
        if(-1==foundLangs.indexOf(lp)) {
            warns.push({line: ln, text: 'missing section for lang %', params: [lp]});
        }
    }
    return warns;
}

multilang.getWarningsButtons=function getWarningsButtons(doc){
    var docLines = doc.split("\n");
    var buttons = "";
    var btnLines = [];
    var bl = 0;
    var warns=[];
    var inButtonsSection=false;
    var inLang = false;
    for(var ln=0; ln<docLines.length; ++ln) {
        if(!inLang) {
            var m = docLines[ln].match(reLangSec);
            if(m) {
                inLang = m[1];
            }
        }
        else if(inLang && docLines[ln]=="") {
            inLang = false;
        }
        if(docLines[ln].match(/^(<!--multilang)/)) {
            if(inLang && inLang != this.defLang) {
               warns.push({line:ln+1, text:'button section must be in main language or in all languages'});
            }
            else {
                buttons = this.generateButtons(doc, this.langs[this.defLang]);
                btnLines = buttons.split("\n");
                inButtonsSection=true;
                bl = 0;
            }
        }
        if(docLines[ln]=='') {
            inButtonsSection = false;
            btnLines = [];
        }
        if(inButtonsSection) {
            if(btnLines.length>bl) {
                if(btnLines[bl] != "" && docLines[ln] != btnLines[bl]) {
                    warns.push({line:ln+1, text:'button section does not match. Expected:\n'+btnLines[bl]+'\n'});
                }
                ++bl;
            }
        }
    }
    return warns;
}

multilang.getWarnings=function getWarnings(doc){
    return this.getWarningsButtons(doc).concat(this.getWarningsLangDirective(doc));
}

multilang.main=function main(parameters){
    return fs.readFile(parameters.input,{encoding: 'utf8'}).then(function(readContent){
        var otherLangContent=multilang.changeDoc(readContent, parameters.lang);
        return fs.writeFile(parameters.out, otherLangContent);
    }).then(function(){
        return Promise.resolve(0);
    }).catch(function(err){
        return Promise.reject(err);
    });
};

module.exports = multilang;
