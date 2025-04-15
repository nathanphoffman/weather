// https://forecast.weather.gov/MapClick.php?lat=40.1852&lon=-75.538&lg=english&&FcstType=digital

//import './extensions.ts';

import axios from "axios";
import {JSDOM} from "jsdom";


const windSpeed = ["", "W", "WW", "WWW", "WWW+"] as const;
const humidity = ["", "H", "HH", "HHH", "HHH+"] as const;
const thunder = ["", "T", "TT", "TTT", "TTT+"] as const;

type WindSpeed = typeof windSpeed[number];
type Humidity = typeof humidity[number];
type Thunder = typeof thunder[number];

// 4 is represented as "more than 3: 3+"
type Magnitude = 0 | 1 | 2 | 3 | 4;
type Postfix = WindSpeed | Humidity | Thunder;
type PostfixLetter =  "W" | "H" | "T"

const LESS = -1, MORE = -1;

type MagnitudeRange = {
    [key in Magnitude]: number[] | ChanceForeast
}

const CHANCEFORECAST = ["--", "SChc", "Chc", "Lkly", "Ocnl"] as const;
type ChanceForeast = typeof CHANCEFORECAST[number];

const HumidityRanges : MagnitudeRange = {
    0: [LESS,54],
    1: [55,69],
    2: [70,80],
    3: [81,90],
    4: [91,MORE]
} as const;

const WindRanges : MagnitudeRange = {
    0: [LESS,14],
    1: [15,24],
    2: [25,31],
    3: [32,38],
    4: [39,MORE]
} as const;

const ChanceRanges : MagnitudeRange = {
    0: "--",
    1: "SChc", // Small Chance
    2: "Chc",  // Chance
    3: "Lkly", // Likely
    4: "Ocnl", // Occasional (max chance)
};

function getPostfix(magnitude: Magnitude, postFixLetter: PostfixLetter) : Postfix {
    if(magnitude > 4 || magnitude < 0) throw "magnitude cannot be greater than 4 or less than 0";
    else if(postFixLetter === "W") return windSpeed[magnitude];
    else if(postFixLetter === "H") return humidity[magnitude];
    else if(postFixLetter === "T") return thunder[magnitude];
    else throw `Postfix ${postFixLetter ?? "empty"} is not setup.`;
}

function getWindMagnitude(windSpeed: number) {

}

function getAverage(...numbers : number[] | Magnitude[]) {
    // !! fix this!
    const average = Math.round(numbers.reduce((a,b)=>{
        const aa = Number(a);
        const bb = Number(b);
        return aa + bb as any;
    })/numbers.length);
    return average;
}

function getAverageChance(...chances: string[]) : Magnitude {
    const magnitudes = chances.map((chance)=>getMagnitude(chance,ChanceRanges));
    const averageMag = getAverage(...magnitudes);
    if(averageMag > 4) return 4 as Magnitude;
    else if (averageMag >= 0) return averageMag as Magnitude;
    else throw "the average chance calculation was beyond the expected range of values";
}


function isInRange(value: number | string, range: number[] | string) {
    if(typeof value === 'string' && typeof range === 'string') return value === range;
    else if(typeof value === 'number' && typeof range === 'string') return ChanceRanges[value] === range;
    else if (typeof value === 'number' && typeof range === 'object' && range.length === 2) {
        if(range[0] === -1 && value <= range[1]) return true;
        if(range[1] === -1 && value >= range[0]) return true;
        else return range[0] <= value && value <= range[1];
    }
    else throw "an unexpected type was encountered when performing a range comparison";
}

function getMagnitude(value: number | string, range: MagnitudeRange) : Magnitude {
    const magnitude = Object.keys(range).find(key=>isInRange(value, range[key]));

    // !! adjust typing going forward
    return magnitude as any as Magnitude;
}

function getRealFeelTemperature(temperature: number, humidity: number, wind: number) {
    // this is a rough approximation, simply adjusting by steps of 5 based on the calculated magnitude of these factors (the number of W and H letters in the output)
    const realFeel = temperature + 5*(+humidity - wind);
    const realFeelIn5s = Math.round(realFeel/5)*5;
    return realFeelIn5s;
}

function getStormRating(skyCover: number, precipChance: number, rainMagnitude: Magnitude, snowMagnitude: Magnitude, windMagnitude: Magnitude, thunderMagnitude: Magnitude) {
    
    // practical max of 10
    const skyCoverOutOf10 = 10*(skyCover/100);

    // practical max of 25 in rare cases
    const windPenalty = windMagnitude*windMagnitude;

    // practical max of 25 in rare cases
    const percipPenalty = (precipChance/100)*((snowMagnitude + rainMagnitude)*3) + Math.round(precipChance/10);

    // practical max of 25 in rare cases
    const thunderPenalty = thunderMagnitude*5;

    const stormRating = skyCoverOutOf10 + windPenalty + percipPenalty + thunderPenalty;
    return Math.round(stormRating);
}


// Rain: Rain & Precipitation Potential (%)
// Thunder: Thunder
// Wind: Surface Wind
// Temp: Temperature F
function getWeatherLine(temperature: number[], skyCover: number[], wind: number[], humidity: number[], precipChance: number[], rain: string[], snow: string[], thunder: string[]) {

    const humidityMagnitude = getMagnitude(getAverage(...humidity), HumidityRanges);
    const windMagnitude = getMagnitude(getAverage(...wind), WindRanges);

    const thunderMagnitude = getMagnitude(getAverageChance(...thunder), ChanceRanges);
    const rainMagnitude = getMagnitude(getAverageChance(...rain), ChanceRanges);
    const snowMagnitude = getMagnitude(getAverageChance(...snow), ChanceRanges);

    const humidityPostFix = getPostfix(humidityMagnitude, "H");
    const windPostFix = getPostfix(windMagnitude, "W");
    const thunderPostFix = getPostfix(thunderMagnitude, "T");

    const realFeelTemperature = getRealFeelTemperature(getAverage(...temperature), humidityMagnitude, windMagnitude);
    const stormRating = getStormRating(getAverage(...skyCover), getAverage(...precipChance), rainMagnitude, snowMagnitude, windMagnitude, thunderMagnitude);

    return `${realFeelTemperature}${humidityPostFix} ${stormRating}${windPostFix}${thunderPostFix}`
}

const url = "https://forecast.weather.gov/MapClick.php?lat=40.1852&lon=-75.538&lg=english&&FcstType=digital";


let data = {};

const HEADER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36';
const HEADER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const config = {
    url,
    method: 'get',
    headers: {
        'User-Agent': HEADER_USER_AGENT,
        'Accept': HEADER_ACCEPT,
    }
};

axios(config).then((response) => {
    const dom = new JSDOM(response.data);
    
    let tableNodeArr = [...dom.window.document.querySelectorAll('.contentArea > table:nth-child(3)')];
    if(tableNodeArr.length === 1) {
        const table = tableNodeArr[0];
        function getRows(row: number) {
            const row1 = [...table.querySelectorAll('tr')][row];
            const row2 = [...table.querySelectorAll('tr')][row + 17];

            const row1Cells = [...row1.querySelectorAll('td > font > b')];
            const row2Cells = [...row2.querySelectorAll('td > font > b')];

            const row1Content = row1Cells.map(x=>x.textContent);
            const row2Content = row2Cells.map(x=>x.textContent);

            return [...row1Content, ...row2Content];
        }

        function getRowChances(row: number) {
            const rowData = getRows(row);
            return rowData as any as ChanceForeast[];
        }

        function getRowNumbers(row: number) : Number[] {
            const rowData = getRows(row);
            return rowData.map(x=>Number(x));
        }

        function splitBy3(arr: any [], prev?: any [][]): any [][] {
            const deepClone = [...arr];
            const take3 = deepClone.splice(0,3);
            if(arr.length < 3) return prev;
            else if(!prev || prev.length === 0) return splitBy3(deepClone, [take3]);
            else if(prev && prev.length > 0 && arr.length > 2) return splitBy3(deepClone, [...prev,take3]);
        }

        //const freezingRainRow = 15;
        //const sleetRow = 16;

        const allDays = getRows(1).filter(x=>x.toUpperCase() !== 'DATE');
        const allHours = getRowNumbers(2);

        // remove the first element because it is a bolded header that gets pulled in
        allHours.splice(0,1);

        const hours = splitBy3(allHours);
        const temperatures = splitBy3(getRowNumbers(3));
        const winds = splitBy3(getRowNumbers(6));
        const skyCover = splitBy3(getRowNumbers(9));
        const precipChance = splitBy3(getRowNumbers(10));
        const humidity = splitBy3(getRowNumbers(11));
        const rains = splitBy3(getRowChances(12));
        const thunder = splitBy3(getRowChances(13));
        const snow = splitBy3(getRowChances(14));

        let day = 0;
        let lineStr = '';

        function milToReg(mil: number): string {
            if(mil > 12) return `${mil - 12}pm`;
            else if (mil === 0) return "12am";
            else return `${mil}am`;
        }

        for(let i = 0; i<16; i++) {
        
            const hour = milToReg(hours[i][1]);
            const weather = getWeatherLine(temperatures[i],skyCover[i],winds[i],humidity[i],precipChance[i],rains[i],snow[i],thunder[i]);
            lineStr += `${hour}: ${weather}  |  `;
     
            if(i === 0) console.log(` ------ ${allDays[day++]} ------ `);
            else if (hours[i][2] < 3) {
                console.log(lineStr);
                lineStr = '';
                console.log(" ")
                console.log(` ------ ${allDays[day++]} ------ `);
            }
            else if(i === 15) {
                console.log(lineStr);
            }
       
        }

    }
    else throw "no table found";

});



