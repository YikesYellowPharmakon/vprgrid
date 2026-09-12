import { RARE_BY_PARENT } from "./rare-families";

export type GenreDef = {
  id: string;
  label: string;
  zh: string;
  synonyms: string[];
  parentId: string;
  canonical: boolean;
  custom?: boolean;
};

export type GenreFamily = {
  id: string;
  label: string;
  zh: string;
  letter: string;
  children: GenreDef[];
  custom?: boolean;
};

export type CustomFamily = {
  id: string;
  label: string;
  zh: string;
};

export type CustomGenre = {
  id: string;
  label: string;
  zh: string;
  synonyms: string[];
  parentId: string;
};

function az<T extends { label: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

function child(
  parentId: string,
  id: string,
  label: string,
  zh: string,
  synonyms: string[],
  canonical = false,
): GenreDef {
  return { id, label, zh, synonyms, parentId, canonical };
}

type ChildSpec = [string, string, string, string[], boolean?];

type FamilySpec = {
  id: string;
  label: string;
  zh: string;
  children: ChildSpec[];
};

/**
 * 核心谱系(实验音乐 13 母类)。默认口味是全库,不再单独开 Baseline。
 */
const CORE_SOURCE: FamilySpec[] = [
  {
    id: "afro-tropical",
    label: "Afro & Tropical",
    zh: "非洲与热带主义",
    children: [
      ["african-electronic", "African Electronic", "非洲电子", ["african electronic", "african electronica"]],
      ["afro-jazz", "Afro-Jazz", "非洲爵士", ["afro-jazz", "afro jazz"]],
      ["afrobeat", "Afrobeat", "非洲节拍", ["afrobeat", "afro-beat"]],
      ["afrofuturism", "Afrofuturism", "非洲未来主义", ["afrofuturism", "afro-futurism"]],
      ["ethio-jazz", "Ethio-Jazz", "埃塞俄比亚爵士", ["ethio-jazz", "ethio jazz", "ethiopian jazz"]],
      ["latin-experimental", "Latin Experimental", "拉美实验", ["latin experimental", "experimental latin"]],
      ["tropicalia", "Tropicália", "热带主义", ["tropicalia", "tropicália", "tropicalismo"]],
    ],
  },
  {
    id: "ambient-drone",
    label: "Ambient & Drone",
    zh: "氛围与持续音",
    children: [
      ["ambient", "Ambient", "氛围", ["ambient", "ambient music"], true],
      ["ambient-techno", "Ambient Techno", "氛围techno", ["ambient techno"]],
      ["dark-ambient", "Dark Ambient", "暗潮氛围", ["dark ambient", "isolationist ambient"]],
      ["deep-listening", "Deep Listening", "深层聆听", ["deep listening"]],
      ["drone", "Drone", "Drone", ["drone", "drone music", "drone metal"], true],
      ["fourth-world", "Fourth World", "第四世界", ["fourth world", "4th world"]],
      ["frippertronics", "Frippertronics", "Frippertronics", ["frippertronics", "frippertronic"]],
      ["isolationism", "Isolationism", "孤立主义", ["isolationism", "isolationist"]],
      ["organ-drone", "Organ Drone", "管风琴持续音", ["organ drone"]],
      ["radiophonic", "Radiophonic", "放射声", ["radiophonic", "radiophonic workshop"]],
      ["space-ambient", "Space Ambient", "太空氛围", ["space ambient", "space-ambient"]],
    ],
  },
  {
    id: "collage-sampling",
    label: "Collage & Sampling",
    zh: "拼贴与采样",
    children: [
      ["abstract-hip-hop", "Abstract Hip-Hop", "抽象嘻哈", ["abstract hip-hop", "abstract hip hop", "experimental hip-hop", "experimental hip hop"]],
      ["cut-up", "Cut-up", "剪辑拼贴", ["cut-up", "cut up", "cutup"]],
      ["hauntology", "Hauntology", "幽灵学", ["hauntology", "hauntological"]],
      ["illbient", "Illbient", "病态氛围", ["illbient"]],
      ["plunderphonics", "Plunderphonics", "掠夺采样", ["plunderphonics", "plunderphonic"], true],
      ["sampledelia", "Sampledelia", "采样迷幻", ["sampledelia", "sampledelic"]],
      ["sound-collage", "Sound Collage", "声音拼贴", ["sound collage", "tape collage", "found sound"]],
      ["turntablism", "Turntablism", "唱盘主义", ["turntablism", "turntablist"]],
    ],
  },
  {
    id: "electroacoustic",
    label: "Electroacoustic",
    zh: "电声",
    children: [
      ["acousmatic", "Acousmatic", "幻听", ["acousmatic"]],
      ["eai", "EAI", "电声即兴", ["eai", "electroacoustic improvisation"], true],
      ["electroacoustic", "Electroacoustic", "电声", ["electroacoustic", "electro-acoustic"]],
      ["granular", "Granular", "颗粒合成", ["granular", "granular synthesis"]],
      ["live-electronics", "Live Electronics", "现场电子", ["live electronics", "live-electronics"]],
      ["mixed-music", "Mixed Music", "混合音乐", ["mixed music"]],
      ["musique-concrete", "Musique Concrète", "具体音乐", ["musique concrete", "musique concrète", "musique-concrete"]],
      ["stochastic-music", "Stochastic Music", "随机音乐", ["stochastic music"]],
      ["tape-music", "Tape Music", "磁带音乐", ["tape music", "tape piece"]],
    ],
  },
  {
    id: "electronic",
    label: "Electronic",
    zh: "实验电子",
    children: [
      ["berlin-school", "Berlin School", "柏林学派", ["berlin school", "berlin-school"]],
      ["braindance", "Braindance", "脑舞", ["braindance"]],
      ["clicks-and-cuts", "Clicks & Cuts", "Clicks & Cuts", ["clicks & cuts", "clicks and cuts"]],
      ["computer-music", "Computer Music", "计算机音乐", ["computer music", "computer-music"]],
      ["drill-and-bass", "Drill & Bass", "Drill & Bass", ["drill & bass", "drill and bass", "drill n bass", "drill'n'bass"]],
      ["dub-techno", "Dub Techno", "Dub Techno", ["dub techno"]],
      ["experimental-techno", "Experimental Techno", "实验techno", ["experimental techno"]],
      ["glitch", "Glitch", "故障", ["glitch", "glitch electronica"], true],
      ["idm", "IDM", "智能舞曲", ["idm", "intelligent dance music", "intelligent dance"], true],
      ["microsound", "Microsound", "微声", ["microsound", "micro-sound"]],
    ],
  },
  {
    id: "folk-voice",
    label: "Folk & Voice",
    zh: "民谣与人声",
    children: [
      ["anti-folk", "Anti-Folk", "反民谣", ["anti-folk", "antifolk"]],
      ["avant-folk", "Avant-Folk", "先锋民谣", ["avant-folk", "avant folk", "experimental folk"], true],
      ["chamber-folk", "Chamber Folk", "室内民谣", ["chamber folk"]],
      ["extended-vocal", "Extended Vocal", "延伸人声", ["extended vocal", "extended voice"]],
      ["free-folk", "Free Folk", "自由民谣", ["free folk", "freak folk", "psych folk"]],
      ["new-weird-america", "New Weird America", "新诡异美国", ["new weird america"]],
      ["sound-poetry", "Sound Poetry", "声音诗", ["sound poetry", "sound-poetry"]],
      ["spoken-word", "Spoken Word", "口述", ["spoken word", "spokenword"], true],
      ["text-sound", "Text-Sound", "文本声音", ["text-sound", "text sound", "text-sound composition"]],
    ],
  },
  {
    id: "improvisation",
    label: "Improvisation",
    zh: "即兴",
    children: [
      ["conducted-improvisation", "Conducted Improvisation", "指挥即兴", ["conducted improvisation"]],
      ["free-improvisation", "Free Improvisation", "自由即兴", ["free improvisation", "free improv", "improvised music"], true],
      ["instant-composition", "Instant Composition", "即时作曲", ["instant composition", "instant-composition"]],
      ["non-idiomatic", "Non-Idiomatic", "非惯用即兴", ["non-idiomatic", "non idiomatic"]],
      ["onkyo", "Onkyo", "音响派", ["onkyo", "onkyokei", "onkyo-kei"]],
      ["reductionism", "Reductionism", "减成主义", ["reductionism", "reductionist improvisation"]],
    ],
  },
  {
    id: "internet-microgenre",
    label: "Internet & Microgenre",
    zh: "互联网微风格",
    children: [
      ["breakcore", "Breakcore", "碎拍核心", ["breakcore"]],
      ["broken-transmission", "Broken Transmission", "断裂传输", ["broken transmission", "brokentransmission", "signalwave", "deathdream"]],
      ["chiptune", "Chiptune", "芯片音乐", ["chiptune", "chip music", "8-bit music", "8bit music"]],
      ["circuit-bending", "Circuit Bending", "电路弯曲", ["circuit bending", "circuit-bent"]],
      ["databending", "Databending", "数据弯曲", ["databending", "datamosh", "datamoshing"]],
      ["deconstructed-club", "Deconstructed Club", "解构俱乐部", ["deconstructed club"]],
      ["digital-hardcore", "Digital Hardcore", "数字硬核", ["digital hardcore"]],
      ["dreampunk", "Dreampunk", "梦朋克", ["dreampunk"]],
      ["flashcore", "Flashcore", "Flashcore", ["flashcore"]],
      ["folktronica", "Folktronica", "民谣电子", ["folktronica"]],
      ["hardvapour", "Hardvapour", "硬蒸汽", ["hardvapour", "hardvapor"]],
      ["hypnagogic", "Hypnagogic", "临睡波", ["hypnagogic", "hypnagogic pop"]],
      ["jungle", "Jungle", "丛林", ["jungle music", "intelligent jungle", "atmospheric jungle"]],
      ["vaporwave", "Vaporwave", "蒸汽波", ["vaporwave", "vapourwave"]],
    ],
  },
  {
    id: "jazz",
    label: "Jazz",
    zh: "爵士谱系",
    children: [
      ["avant-garde-jazz", "Avant-Garde Jazz", "先锋爵士", ["avant-garde jazz", "avant garde jazz", "avant-jazz", "avant jazz"]],
      ["chamber-jazz", "Chamber Jazz", "室内爵士", ["chamber jazz"]],
      ["creative-music", "Creative Music", "创造性音乐", ["creative music", "aacm"]],
      ["european-free-jazz", "European Free Jazz", "欧洲自由爵士", ["european free jazz"]],
      ["fire-music", "Fire Music", "火焰音乐", ["fire music"]],
      ["free-jazz", "Free Jazz", "自由爵士", ["free jazz"]],
      ["jazz-noise", "Jazz-Noise", "爵士噪音", ["jazz-noise", "jazz noise", "noise jazz"]],
      ["spiritual-jazz", "Spiritual Jazz", "灵性爵士", ["spiritual jazz"]],
      ["third-stream", "Third Stream", "第三潮流", ["third stream"]],
    ],
  },
  {
    id: "minimal-composition",
    label: "Minimal & Composition",
    zh: "极简与当代作曲",
    children: [
      ["chance-music", "Chance Music", "偶然音乐", ["chance music", "chance operations"]],
      ["darmstadt-school", "Darmstadt School", "达姆施塔特乐派", ["darmstadt school", "darmstadt"]],
      ["fluxus", "Fluxus", "激浪派", ["fluxus"]],
      ["graphic-notation", "Graphic Notation", "图形记谱", ["graphic notation", "graphic score"]],
      ["indeterminate", "Indeterminate", "不确定音乐", ["indeterminate", "indeterminacy", "aleatoric"]],
      ["just-intonation", "Just Intonation", "纯律", ["just intonation", "just-intonation"]],
      ["microtonal", "Microtonal", "微分音", ["microtonal", "microtonality"]],
      ["minimalism", "Minimalism", "极简主义", ["minimalism", "minimalist", "minimal music"], true],
      ["modern-classical", "Modern Classical", "现代古典", ["modern classical", "contemporary classical", "new music"], true],
      ["new-york-school", "New York School", "纽约乐派", ["new york school", "ny school"]],
      ["post-minimalism", "Post-Minimalism", "后极简", ["post-minimalism", "post-minimal", "postminimal"]],
      ["prepared-piano", "Prepared Piano", "预制钢琴", ["prepared piano"]],
      ["process-music", "Process Music", "过程音乐", ["process music"]],
      ["serialism", "Serialism", "序列主义", ["serialism", "serial music", "twelve-tone", "12-tone", "dodecaphonic"]],
      ["spectralism", "Spectralism", "频谱主义", ["spectralism", "spectral music"]],
      ["wandelweiser", "Wandelweiser", "Wandelweiser", ["wandelweiser"]],
    ],
  },
  {
    id: "noise",
    label: "Noise",
    zh: "噪音",
    children: [
      ["death-industrial", "Death Industrial", "死亡工业", ["death industrial", "death-industrial"]],
      ["free-noise", "Free Noise", "自由噪音", ["free noise"]],
      ["harsh-noise", "Harsh Noise", "刺耳噪音", ["harsh noise", "hnw", "harsh noise wall"]],
      ["industrial", "Industrial", "工业", ["industrial", "industrial music"]],
      ["japanoise", "Japanoise", "日本噪音", ["japanoise", "japan noise"]],
      ["noise", "Noise", "噪音", ["noise", "noise music", "noise wall"]],
      ["noise-ambient", "Noise Ambient", "噪音氛围", ["noise ambient", "ambient noise"]],
      ["power-electronics", "Power Electronics", "力量电子", ["power electronics", "power-electronics"]],
    ],
  },
  {
    id: "rock-post",
    label: "Rock & Post",
    zh: "实验摇滚与后摇滚",
    children: [
      ["art-rock", "Art Rock", "艺术摇滚", ["art rock"]],
      ["avant-prog", "Avant-Prog", "先锋前卫", ["avant-prog", "avant prog"]],
      ["canterbury", "Canterbury", "坎特伯雷", ["canterbury scene", "canterbury rock"]],
      ["experimental-rock", "Experimental Rock", "实验摇滚", ["experimental rock", "avant-rock", "avant rock"]],
      ["kosmische", "Kosmische", "宇宙音乐", ["kosmische", "kosmische musik"]],
      ["krautrock", "Krautrock", "德国摇滚", ["krautrock"]],
      ["math-rock", "Math Rock", "数学摇滚", ["math rock", "math-rock"]],
      ["no-wave", "No Wave", "无浪潮", ["no wave", "no-wave"]],
      ["noise-rock", "Noise Rock", "噪音摇滚", ["noise rock", "noise-rock"]],
      ["post-punk", "Post-Punk", "后朋克", ["post-punk", "post punk"]],
      ["post-rock", "Post-Rock", "后摇滚", ["post-rock", "post rock"]],
      ["rio", "Rock in Opposition", "对抗摇滚", ["rock in opposition"]],
      ["zeuhl", "Zeuhl", "Zeuhl", ["zeuhl"]],
    ],
  },
  {
    id: "sound-environment",
    label: "Sound & Environment",
    zh: "声音与环境",
    children: [
      ["acoustic-ecology", "Acoustic Ecology", "声学生态", ["acoustic ecology"]],
      ["bioacoustics", "Bioacoustics", "生物声学", ["bioacoustics", "bio-acoustics"]],
      ["field-recordings", "Field Recordings", "田野录音", ["field recording", "field recordings"], true],
      ["lowercase", "Lowercase", "Lowercase", ["lowercase", "lowercase sound"]],
      ["phonography", "Phonography", "声音摄影", ["phonography", "phonographer"]],
      ["sound-art", "Sound Art", "声音艺术", ["sound art", "sound-art"]],
      ["soundscape", "Soundscape", "声景", ["soundscape", "soundscape composition"]],
      ["soundwalk", "Soundwalk", "声音行走", ["soundwalk", "sound walk"]],
    ],
  },
];

/**
 * 扩充谱系(按 RYM / AOTY 总风格树补齐的大众与地域母类)。
 * 和核心谱系一起进默认全库。
 */
const EXPANSION_SOURCE: FamilySpec[] = [
  {
    id: "blues-gospel",
    label: "Blues & Gospel",
    zh: "蓝调与福音",
    children: [
      ["blues-rock", "Blues Rock", "蓝调摇滚", ["blues rock", "blues-rock"]],
      ["chicago-blues", "Chicago Blues", "芝加哥蓝调", ["chicago blues"]],
      ["country-blues", "Country Blues", "乡村蓝调", ["country blues", "acoustic blues"]],
      ["delta-blues", "Delta Blues", "三角洲蓝调", ["delta blues"]],
      ["electric-blues", "Electric Blues", "电声蓝调", ["electric blues"]],
      ["gospel", "Gospel", "福音", ["gospel", "gospel music"]],
      ["hill-country-blues", "Hill Country Blues", "丘陵蓝调", ["hill country blues"]],
      ["jump-blues", "Jump Blues", "跳跃蓝调", ["jump blues"]],
      ["piedmont-blues", "Piedmont Blues", "皮德蒙特蓝调", ["piedmont blues"]],
      ["soul-blues", "Soul Blues", "灵魂蓝调", ["soul blues"]],
      ["texas-blues", "Texas Blues", "德州蓝调", ["texas blues"]],
    ],
  },
  {
    id: "classical-early",
    label: "Classical & Early",
    zh: "古典与早期音乐",
    children: [
      ["art-song", "Art Song", "艺术歌曲", ["art song", "lieder"]],
      ["baroque", "Baroque", "巴洛克", ["baroque"]],
      ["chamber-music", "Chamber Music", "室内乐", ["chamber music"]],
      ["choral", "Choral", "合唱", ["choral", "choral music"]],
      ["classical-period", "Classical Period", "古典主义时期", ["classical period"]],
      ["early-music", "Early Music", "早期音乐", ["early music"]],
      ["impressionism", "Impressionism", "印象主义", ["impressionism", "impressionist"]],
      ["medieval", "Medieval", "中世纪", ["medieval music", "gregorian chant", "plainchant"]],
      ["opera", "Opera", "歌剧", ["opera"]],
      ["orchestral", "Orchestral", "管弦乐", ["orchestral", "symphony", "symphonic"]],
      ["renaissance-music", "Renaissance", "文艺复兴", ["renaissance music", "renaissance polyphony"]],
      ["romanticism", "Romanticism", "浪漫主义", ["romanticism", "romantic era"]],
      ["sacred-music", "Sacred Music", "宗教音乐", ["sacred music", "liturgical"]],
      ["solo-piano", "Solo Piano", "独奏钢琴", ["solo piano", "piano works"]],
      ["string-quartet", "String Quartet", "弦乐四重奏", ["string quartet"]],
    ],
  },
  {
    id: "country-americana",
    label: "Country & Americana",
    zh: "乡村与美式根源",
    children: [
      ["alt-country", "Alt-Country", "另类乡村", ["alt-country", "alt country", "alternative country"]],
      ["americana", "Americana", "美式根源", ["americana"]],
      ["bluegrass", "Bluegrass", "蓝草", ["bluegrass"]],
      ["country-rock", "Country Rock", "乡村摇滚", ["country rock"]],
      ["gothic-country", "Gothic Country", "哥特乡村", ["gothic country", "dark country"]],
      ["honky-tonk", "Honky Tonk", "酒馆乡村", ["honky tonk", "honky-tonk"]],
      ["old-time", "Old-Time", "老时光", ["old-time music", "old time music"]],
      ["outlaw-country", "Outlaw Country", "法外乡村", ["outlaw country"]],
      ["progressive-bluegrass", "Progressive Bluegrass", "前卫蓝草", ["progressive bluegrass", "newgrass"]],
      ["western-swing", "Western Swing", "西部摇摆", ["western swing"]],
    ],
  },
  {
    id: "dance-club",
    label: "Dance & Club",
    zh: "舞曲与俱乐部",
    children: [
      ["acid-house", "Acid House", "酸性浩室", ["acid house"]],
      ["acid-techno", "Acid Techno", "酸性 Techno", ["acid techno"]],
      ["ambient-house", "Ambient House", "氛围浩室", ["ambient house"]],
      ["balearic", "Balearic Beat", "巴利阿里", ["balearic"]],
      ["bass-music", "Bass Music", "贝斯音乐", ["bass music", "uk bass"]],
      ["breakbeat", "Breakbeat", "碎拍", ["breakbeat", "big beat"]],
      ["deep-house", "Deep House", "深浩室", ["deep house"]],
      ["detroit-techno", "Detroit Techno", "底特律 Techno", ["detroit techno"]],
      ["disco", "Disco", "迪斯科", ["disco", "nu-disco", "nu disco"]],
      ["drum-and-bass", "Drum and Bass", "鼓打贝斯", ["drum and bass", "drum n bass", "drum'n'bass", "liquid funk"]],
      ["dubstep", "Dubstep", "回响贝斯", ["dubstep"]],
      ["electro", "Electro", "Electro", ["electro"]],
      ["eurodance", "Eurodance", "欧陆舞曲", ["eurodance"]],
      ["footwork", "Footwork", "Footwork", ["footwork", "juke"]],
      ["french-house", "French House", "法式浩室", ["french house", "filter house"]],
      ["garage-house", "Garage House", "车库浩室", ["garage house"]],
      ["ghettotech", "Ghettotech", "Ghettotech", ["ghettotech"]],
      ["grime", "Grime", "Grime", ["grime"]],
      ["hard-techno", "Hard Techno", "硬核 Techno", ["hard techno", "industrial techno"]],
      ["house", "House", "浩室", ["house music", "tech house", "progressive house"]],
      ["italo-disco", "Italo-Disco", "意大利迪斯科", ["italo-disco", "italo disco"]],
      ["microhouse", "Microhouse", "微浩室", ["microhouse", "micro-house"]],
      ["minimal-techno", "Minimal Techno", "极简 Techno", ["minimal techno"]],
      ["techno", "Techno", "Techno", ["techno"]],
      ["trance", "Trance", "出神", ["trance", "psytrance", "goa trance"]],
      ["uk-garage", "UK Garage", "英式车库", ["uk garage", "2-step", "speed garage"]],
    ],
  },
  {
    id: "dub-reggae",
    label: "Dub & Reggae",
    zh: "雷鬼与回响",
    children: [
      ["dancehall", "Dancehall", "舞厅雷鬼", ["dancehall"]],
      ["dub", "Dub", "回响", ["dub reggae", "dub music"]],
      ["dub-poetry", "Dub Poetry", "回响诗", ["dub poetry"]],
      ["lovers-rock", "Lovers Rock", "恋人摇滚", ["lovers rock"]],
      ["ragga", "Ragga", "拉格", ["ragga", "raggamuffin"]],
      ["reggae", "Reggae", "雷鬼", ["reggae"]],
      ["rocksteady", "Rocksteady", "慢拍斯卡", ["rocksteady"]],
      ["roots-reggae", "Roots Reggae", "根源雷鬼", ["roots reggae"]],
      ["ska", "Ska", "斯卡", ["ska", "ska revival", "two-tone"]],
    ],
  },
  {
    id: "global-regional",
    label: "Global & Regional",
    zh: "全球与地域",
    children: [
      ["balkan", "Balkan", "巴尔干", ["balkan brass", "balkan folk"]],
      ["bossa-nova", "Bossa Nova", "巴萨诺瓦", ["bossa nova"]],
      ["carnatic", "Carnatic", "卡纳蒂克", ["carnatic"]],
      ["celtic", "Celtic Folk", "凯尔特", ["celtic folk", "celtic music"]],
      ["cumbia", "Cumbia", "昆比亚", ["cumbia"]],
      ["desert-blues", "Desert Blues", "沙漠蓝调", ["desert blues", "tishoumaren", "tuareg"]],
      ["enka", "Enka", "演歌", ["enka"]],
      ["fado", "Fado", "法朵", ["fado"]],
      ["flamenco", "Flamenco", "弗拉门戈", ["flamenco"]],
      ["gamelan", "Gamelan", "甘美兰", ["gamelan"]],
      ["gnawa", "Gnawa", "格纳瓦", ["gnawa", "gnaoua"]],
      ["highlife", "Highlife", "高级生活", ["highlife"]],
      ["hindustani", "Hindustani Classical", "印度斯坦古典", ["hindustani", "indian classical", "raga"]],
      ["klezmer", "Klezmer", "克莱兹默", ["klezmer"]],
      ["mpb", "MPB", "巴西流行音乐", ["mpb", "musica popular brasileira"]],
      ["qawwali", "Qawwali", "卡瓦利", ["qawwali"]],
      ["rai", "Raï", "拉伊", ["rai"]],
      ["samba", "Samba", "桑巴", ["samba"]],
      ["soca", "Soca", "索卡", ["soca"]],
      ["son-cubano", "Son Cubano", "古巴颂", ["son cubano"]],
      ["tango", "Tango", "探戈", ["tango", "nuevo tango"]],
      ["throat-singing", "Throat Singing", "呼麦", ["throat singing", "tuvan", "khoomei"]],
      ["zamrock", "Zamrock", "赞比亚摇滚", ["zamrock"]],
    ],
  },
  {
    id: "hip-hop",
    label: "Hip Hop",
    zh: "嘻哈",
    children: [
      ["boom-bap", "Boom Bap", "Boom Bap", ["boom bap", "boom-bap"]],
      ["cloud-rap", "Cloud Rap", "云说唱", ["cloud rap"]],
      ["conscious-hip-hop", "Conscious Hip Hop", "觉醒嘻哈", ["conscious hip hop", "conscious rap"]],
      ["drill", "Drill", "Drill", ["uk drill", "chicago drill", "drill rap"]],
      ["drumless", "Drumless", "无鼓", ["drumless"]],
      ["east-coast-hip-hop", "East Coast Hip Hop", "东岸嘻哈", ["east coast hip hop"]],
      ["g-funk", "G-Funk", "G-Funk", ["g-funk", "g funk"]],
      ["hardcore-hip-hop", "Hardcore Hip Hop", "硬核嘻哈", ["hardcore hip hop", "hardcore rap"]],
      ["instrumental-hip-hop", "Instrumental Hip Hop", "器乐嘻哈", ["instrumental hip hop", "instrumental hip-hop", "beat tape"]],
      ["jazz-rap", "Jazz Rap", "爵士说唱", ["jazz rap", "jazz hop"]],
      ["lofi-hip-hop", "Lo-Fi Hip Hop", "Lo-Fi 嘻哈", ["lo-fi hip hop", "lofi hip hop", "chillhop"]],
      ["memphis-rap", "Memphis Rap", "孟菲斯说唱", ["memphis rap", "phonk"]],
      ["southern-hip-hop", "Southern Hip Hop", "南部嘻哈", ["southern hip hop", "dirty south"]],
      ["trap", "Trap", "陷阱", ["trap music", "trap rap"]],
      ["trip-hop", "Trip Hop", "神游舞曲", ["trip hop", "trip-hop"]],
      ["uk-hip-hop", "UK Hip Hop", "英式嘻哈", ["uk hip hop", "uk rap"]],
      ["west-coast-hip-hop", "West Coast Hip Hop", "西岸嘻哈", ["west coast hip hop"]],
    ],
  },
  {
    id: "indie-alternative",
    label: "Indie & Alternative",
    zh: "独立与另类",
    children: [
      ["alternative-rock", "Alternative Rock", "另类摇滚", ["alternative rock", "alt-rock", "alt rock"]],
      ["britpop", "Britpop", "英伦摇滚", ["britpop"]],
      ["c86", "C86", "C86", ["c86"]],
      ["college-rock", "College Rock", "学院摇滚", ["college rock", "jangle rock"]],
      ["dream-pop", "Dream Pop", "梦幻流行", ["dream pop", "dreampop"]],
      ["emo", "Emo", "Emo", ["midwest emo", "emo rock", "emo revival"]],
      ["garage-rock", "Garage Rock", "车库摇滚", ["garage rock", "garage rock revival"]],
      ["grunge", "Grunge", "垃圾摇滚", ["grunge"]],
      ["indie-rock", "Indie Rock", "独立摇滚", ["indie rock"]],
      ["jangle-pop", "Jangle Pop", "叮当流行", ["jangle pop"]],
      ["lo-fi-indie", "Lo-Fi Indie", "Lo-Fi 独立", ["lo-fi indie", "lo-fi rock", "lofi rock"]],
      ["madchester", "Madchester", "疯彻斯特", ["madchester", "baggy"]],
      ["sadcore", "Sadcore", "悲核", ["sadcore"]],
      ["shoegaze", "Shoegaze", "自赏", ["shoegaze", "shoegazing", "nu gaze", "blackgaze"]],
      ["slacker-rock", "Slacker Rock", "懒汉摇滚", ["slacker rock"]],
      ["slowcore", "Slowcore", "慢核", ["slowcore"]],
    ],
  },
  {
    id: "metal",
    label: "Metal",
    zh: "金属",
    children: [
      ["atmospheric-black-metal", "Atmospheric Black Metal", "氛围黑金属", ["atmospheric black metal"]],
      ["black-metal", "Black Metal", "黑金属", ["black metal"]],
      ["death-metal", "Death Metal", "死亡金属", ["death metal", "technical death metal"]],
      ["doom-metal", "Doom Metal", "厄运金属", ["doom metal"]],
      ["drone-metal", "Drone Metal", "持续音金属", ["drone doom", "drone-metal"]],
      ["folk-metal", "Folk Metal", "民谣金属", ["folk metal", "viking metal"]],
      ["funeral-doom", "Funeral Doom", "葬礼厄运", ["funeral doom"]],
      ["grindcore", "Grindcore", "碾核", ["grindcore", "goregrind"]],
      ["heavy-metal", "Heavy Metal", "重金属", ["heavy metal", "nwobhm"]],
      ["metalcore", "Metalcore", "金属核", ["metalcore", "mathcore"]],
      ["post-metal", "Post-Metal", "后金属", ["post-metal", "post metal"]],
      ["power-metal", "Power Metal", "力量金属", ["power metal"]],
      ["progressive-metal", "Progressive Metal", "前卫金属", ["progressive metal", "prog metal", "djent"]],
      ["sludge-metal", "Sludge Metal", "污泥金属", ["sludge metal", "sludge"]],
      ["stoner-metal", "Stoner Metal", "石人金属", ["stoner metal", "stoner doom"]],
      ["thrash-metal", "Thrash Metal", "鞭击金属", ["thrash metal", "crossover thrash"]],
    ],
  },
  {
    id: "pop",
    label: "Pop",
    zh: "流行光谱",
    children: [
      ["art-pop", "Art Pop", "艺术流行", ["art pop", "art-pop"]],
      ["baroque-pop", "Baroque Pop", "巴洛克流行", ["baroque pop"]],
      ["bedroom-pop", "Bedroom Pop", "卧室流行", ["bedroom pop"]],
      ["bubblegum-bass", "Bubblegum Bass", "泡泡糖贝斯", ["bubblegum bass", "pc music"]],
      ["chamber-pop", "Chamber Pop", "室内流行", ["chamber pop"]],
      ["city-pop", "City Pop", "都市流行", ["city pop"]],
      ["dance-pop", "Dance-Pop", "舞曲流行", ["dance-pop", "dance pop"]],
      ["electropop", "Electropop", "电子流行", ["electropop", "electro-pop"]],
      ["hyperpop", "Hyperpop", "超流行", ["hyperpop", "glitchcore"]],
      ["indie-pop", "Indie Pop", "独立流行", ["indie pop", "indiepop"]],
      ["j-pop", "J-Pop", "日本流行", ["j-pop", "jpop"]],
      ["k-pop", "K-Pop", "韩国流行", ["k-pop", "kpop"]],
      ["noise-pop", "Noise Pop", "噪音流行", ["noise pop"]],
      ["power-pop", "Power Pop", "强力流行", ["power pop", "powerpop"]],
      ["progressive-pop", "Progressive Pop", "前卫流行", ["progressive pop"]],
      ["psychedelic-pop", "Psychedelic Pop", "迷幻流行", ["psychedelic pop", "psych pop"]],
      ["sophisti-pop", "Sophisti-Pop", "雅致流行", ["sophisti-pop", "sophisti pop"]],
      ["sunshine-pop", "Sunshine Pop", "阳光流行", ["sunshine pop"]],
      ["synth-pop", "Synth-Pop", "合成器流行", ["synth-pop", "synthpop", "synth pop"]],
      ["twee-pop", "Twee Pop", "甜腻流行", ["twee pop"]],
    ],
  },
  {
    id: "psychedelia",
    label: "Psychedelia",
    zh: "迷幻",
    children: [
      ["acid-folk", "Acid Folk", "酸性民谣", ["acid folk"]],
      ["acid-rock", "Acid Rock", "酸性摇滚", ["acid rock"]],
      ["heavy-psych", "Heavy Psych", "重迷幻", ["heavy psych", "heavy psychedelia"]],
      ["neo-psychedelia", "Neo-Psychedelia", "新迷幻", ["neo-psychedelia", "neo psychedelia", "neo-psych"]],
      ["psychedelic-folk", "Psychedelic Folk", "迷幻民谣", ["psychedelic folk"]],
      ["psychedelic-rock", "Psychedelic Rock", "迷幻摇滚", ["psychedelic rock", "psych rock"]],
      ["psychedelic-soul", "Psychedelic Soul", "迷幻灵魂", ["psychedelic soul"]],
      ["raga-rock", "Raga Rock", "拉格摇滚", ["raga rock"]],
      ["space-rock", "Space Rock", "太空摇滚", ["space rock"]],
      ["stoner-rock", "Stoner Rock", "石人摇滚", ["stoner rock"]],
    ],
  },
  {
    id: "punk-hardcore",
    label: "Punk & Hardcore",
    zh: "朋克与硬核",
    children: [
      ["anarcho-punk", "Anarcho-Punk", "无政府朋克", ["anarcho-punk", "anarcho punk"]],
      ["art-punk", "Art Punk", "艺术朋克", ["art punk"]],
      ["crust-punk", "Crust Punk", "壳朋克", ["crust punk"]],
      ["d-beat", "D-Beat", "D-Beat", ["d-beat"]],
      ["egg-punk", "Egg Punk", "蛋朋克", ["egg punk", "devo-core"]],
      ["garage-punk", "Garage Punk", "车库朋克", ["garage punk"]],
      ["hardcore-punk", "Hardcore Punk", "硬核朋克", ["hardcore punk"]],
      ["post-hardcore", "Post-Hardcore", "后硬核", ["post-hardcore", "post hardcore"]],
      ["powerviolence", "Powerviolence", "强力暴力", ["powerviolence", "power violence"]],
      ["proto-punk", "Proto-Punk", "原型朋克", ["proto-punk", "proto punk"]],
      ["punk-rock", "Punk Rock", "朋克摇滚", ["punk rock"]],
      ["riot-grrrl", "Riot Grrrl", "暴女", ["riot grrrl"]],
      ["screamo", "Screamo", "尖叫核", ["screamo", "skramz"]],
      ["ska-punk", "Ska Punk", "斯卡朋克", ["ska punk", "ska-punk"]],
    ],
  },
  {
    id: "rnb-soul-funk",
    label: "R&B, Soul & Funk",
    zh: "节奏布鲁斯与放克",
    children: [
      ["alternative-rnb", "Alternative R&B", "另类 R&B", ["alternative r&b", "alt-r&b", "alternative rnb"]],
      ["boogie", "Boogie", "布基", ["boogie"]],
      ["contemporary-rnb", "Contemporary R&B", "当代 R&B", ["contemporary r&b", "contemporary rnb"]],
      ["deep-soul", "Deep Soul", "深沉灵魂", ["deep soul"]],
      ["funk", "Funk", "放克", ["funk", "p-funk"]],
      ["neo-soul", "Neo-Soul", "新灵魂", ["neo-soul", "neo soul", "neosoul"]],
      ["new-jack-swing", "New Jack Swing", "新杰克摇摆", ["new jack swing"]],
      ["northern-soul", "Northern Soul", "北方灵魂", ["northern soul"]],
      ["quiet-storm", "Quiet Storm", "静谧风暴", ["quiet storm"]],
      ["smooth-soul", "Smooth Soul", "丝滑灵魂", ["smooth soul"]],
      ["soul", "Soul", "灵魂乐", ["soul music", "southern soul", "motown"]],
    ],
  },
  {
    id: "songwriter-vocal",
    label: "Songwriter & Vocal",
    zh: "唱作与人声",
    children: [
      ["bolero", "Bolero", "波莱罗", ["bolero"]],
      ["chanson", "Chanson", "香颂", ["chanson"]],
      ["singer-songwriter", "Singer-Songwriter", "唱作人", ["singer-songwriter", "singer songwriter"]],
      ["standards", "Standards", "标准曲", ["great american songbook", "standards"]],
      ["vocal-jazz", "Vocal Jazz", "人声爵士", ["vocal jazz"]],
    ],
  },
];

/** 既有核心母类的扩充子类。 */
const EXPANSION_EXTRA: Record<string, ChildSpec[]> = {
  "ambient-drone": [
    ["ambient-dub", "Ambient Dub", "氛围回响", ["ambient dub"]],
    ["ambient-pop", "Ambient Pop", "氛围流行", ["ambient pop"]],
    ["kankyo-ongaku", "Kankyō Ongaku", "环境音乐", ["kankyo ongaku", "kankyō ongaku", "environmental music"]],
    ["new-age", "New Age", "新世纪", ["new age", "new-age"]],
  ],
  electronic: [
    ["downtempo", "Downtempo", "缓拍", ["downtempo", "chill-out", "chillout"]],
    ["nu-jazz", "Nu Jazz", "新爵士电子", ["nu jazz", "nu-jazz", "future jazz"]],
    ["progressive-electronic", "Progressive Electronic", "前卫电子", ["progressive electronic"]],
    ["synthwave", "Synthwave", "合成器浪潮", ["synthwave", "retrowave", "darksynth"]],
    ["wonky", "Wonky", "Wonky", ["wonky"]],
  ],
  jazz: [
    ["bebop", "Bebop", "比波普", ["bebop"]],
    ["big-band", "Big Band", "大乐队", ["big band"]],
    ["cool-jazz", "Cool Jazz", "冷爵士", ["cool jazz"]],
    ["ecm-style", "ECM Style Jazz", "ECM 风格", ["ecm style", "ecm jazz"]],
    ["hard-bop", "Hard Bop", "硬波普", ["hard bop"]],
    ["jazz-fusion", "Jazz Fusion", "融合爵士", ["jazz fusion", "fusion jazz", "jazz-funk", "jazz funk"]],
    ["latin-jazz", "Latin Jazz", "拉丁爵士", ["latin jazz"]],
    ["modal-jazz", "Modal Jazz", "调式爵士", ["modal jazz"]],
    ["post-bop", "Post-Bop", "后波普", ["post-bop", "post bop"]],
    ["swing", "Swing", "摇摆", ["swing jazz"]],
  ],
  noise: [
    ["ebm", "EBM", "电子身体音乐", ["ebm", "electronic body music"]],
    ["electro-industrial", "Electro-Industrial", "电子工业", ["electro-industrial", "electro industrial"]],
    ["rhythmic-noise", "Rhythmic Noise", "节奏噪音", ["rhythmic noise", "power noise"]],
  ],
  "rock-post": [
    ["gothic-rock", "Gothic Rock", "哥特摇滚", ["gothic rock", "goth rock", "darkwave", "coldwave"]],
    ["progressive-rock", "Progressive Rock", "前卫摇滚", ["progressive rock", "prog rock"]],
  ],
  "folk-voice": [
    ["american-primitivism", "American Primitivism", "美式原始主义", ["american primitivism", "american primitive guitar"]],
    ["contemporary-folk", "Contemporary Folk", "当代民谣", ["contemporary folk"]],
    ["indie-folk", "Indie Folk", "独立民谣", ["indie folk"]],
    ["traditional-folk", "Traditional Folk", "传统民谣", ["traditional folk", "folk ballad"]],
  ],
};

export function familyLetter(label: string): string {
  const m = label.match(/[A-Za-z]/);
  return m ? m[0]!.toUpperCase() : "#";
}

function withRare(family: FamilySpec): FamilySpec {
  return { ...family, children: [...family.children, ...(RARE_BY_PARENT[family.id] ?? [])] };
}

const MERGED_SOURCE: FamilySpec[] = [
  ...CORE_SOURCE.map((f) => withRare({ ...f, children: [...f.children, ...(EXPANSION_EXTRA[f.id] ?? [])] })),
  ...EXPANSION_SOURCE.map(withRare),
];

export const GENRE_FAMILIES: GenreFamily[] = az(
  MERGED_SOURCE.map((family) => ({
    id: family.id,
    label: family.label,
    zh: family.zh,
    letter: familyLetter(family.label),
    children: az(family.children.map((c) => child(family.id, c[0], c[1], c[2], c[3], Boolean(c[4])))),
  })),
);

export const ALL_GENRES: GenreDef[] = GENRE_FAMILIES.flatMap((f) => f.children);

/** 旧 Baseline(只给存档升级对照用):核心谱系去掉 Rock & Post、Internet & Microgenre。 */
const BASELINE_EXCLUDED = new Set(["rock-post", "internet-microgenre"]);
export const BASELINE_TASTE: string[] = CORE_SOURCE.filter((f) => !BASELINE_EXCLUDED.has(f.id)).flatMap(
  (f) => f.children.map((c) => c[0]),
);

/** 全库 = 所有内置子类。默认口味就是这一套。 */
export const ALL_TASTE: string[] = ALL_GENRES.map((g) => g.id);
export const DEFAULT_TASTE = ALL_TASTE;

/** 存档/档案里还停在旧 Baseline 或空数组的,升成全库。自定义口味原样留下。 */
export function normalizePersistedTaste(taste: string[]): string[] {
  const set = new Set(taste);
  const wasBaseline = taste.length === BASELINE_TASTE.length && BASELINE_TASTE.every((id) => set.has(id));
  if (wasBaseline || taste.length === 0) return [...ALL_TASTE];
  return taste;
}

/** 当前口味对应哪个预设。默认全库不算「自定义」。 */
export function tastePreset(taste: string[]): "all" | "custom" {
  const set = new Set(taste);
  if (ALL_TASTE.every((id) => set.has(id))) return "all";
  return "custom";
}

export const CANONICAL_GENRES = ALL_GENRES.filter((g) => g.canonical);

export const FAMILY_LETTERS = [...new Set(GENRE_FAMILIES.map((f) => f.letter))];

/** Original typed names → corrected labels shown in the taxonomy. */
export const SPELLING_FIXES: Array<{ from: string; to: string }> = [
  { from: "amient", to: "Ambient" },
  { from: "avant folk", to: "Avant-Folk" },
  { from: "field recordings", to: "Field Recordings" },
  { from: "free improvisation", to: "Free Improvisation" },
  { from: "modern classical", to: "Modern Classical" },
  { from: "spoken word", to: "Spoken Word" },
  { from: "EAI", to: "EAI" },
  { from: "IDM", to: "IDM" },
];

export function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

export function mergeTaxonomy(customFamilies: CustomFamily[], customGenres: CustomGenre[]): GenreFamily[] {
  const extraByParent = new Map<string, GenreDef[]>();
  for (const g of customGenres) {
    const def: GenreDef = {
      id: g.id,
      label: g.label,
      zh: g.zh,
      synonyms: g.synonyms,
      parentId: g.parentId,
      canonical: false,
      custom: true,
    };
    const list = extraByParent.get(g.parentId) ?? [];
    list.push(def);
    extraByParent.set(g.parentId, list);
  }

  const built = GENRE_FAMILIES.map((family) => ({
    ...family,
    children: az([...family.children, ...(extraByParent.get(family.id) ?? [])]),
  }));

  const custom = customFamilies.map((family) => ({
    id: family.id,
    label: family.label,
    zh: family.zh,
    letter: familyLetter(family.label),
    custom: true,
    children: az(extraByParent.get(family.id) ?? []),
  }));

  return az([...built, ...custom]);
}

export function genreById(id: string, extra: GenreDef[] = []): GenreDef | undefined {
  return extra.find((g) => g.id === id) ?? ALL_GENRES.find((g) => g.id === id);
}

export function familyById(id: string, families: GenreFamily[] = GENRE_FAMILIES): GenreFamily | undefined {
  return families.find((f) => f.id === id);
}

export function familyOfGenre(genreId: string, families: GenreFamily[] = GENRE_FAMILIES): GenreFamily | undefined {
  const genres = families.flatMap((f) => f.children);
  const g = genres.find((x) => x.id === genreId);
  return g ? families.find((f) => f.id === g.parentId) : undefined;
}

export function familySelection(family: GenreFamily, taste: string[]): "all" | "some" | "none" {
  const ids = family.children.map((c) => c.id);
  if (ids.length === 0) return "none";
  const n = ids.filter((id) => taste.includes(id)).length;
  if (n === 0) return "none";
  if (n === ids.length) return "all";
  return "some";
}

function haystack(parts: string[]): string {
  return parts
    .filter(Boolean)
    .join(" · ")
    .toLowerCase()
    .normalize("NFKD");
}

function hasTerm(blob: string, term: string): boolean {
  const t = term.toLowerCase();
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (t.includes(" ") || t.includes("&") || t.includes("'")) return blob.includes(t);
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(blob);
}

/**
 * 标题/艺人名里的单个常见词(如 house、noise、trap)极易误判,
 * 只有「有区分度」的同义词(多词短语,或较长的单词)才允许从标题命中;
 * 标签(strong blob)则始终按全部同义词匹配。
 */
function isDistinctive(term: string): boolean {
  return /[\s&\-']/.test(term) || term.length >= 7;
}

export function inferGenres(
  input: {
    title: string;
    artist: string;
    tags: string[];
    secondaryType?: string | null;
  },
  catalog: GenreDef[] = ALL_GENRES,
): string[] {
  const strong = haystack([...(input.tags ?? []), input.secondaryType ?? ""]);
  const weak = haystack([input.title, input.artist]);
  const hit: string[] = [];
  for (const g of catalog) {
    const matched = g.synonyms.some(
      (s) => hasTerm(strong, s) || (isDistinctive(s) && hasTerm(weak, s)),
    );
    if (matched) hit.push(g.id);
  }
  const sec = (input.secondaryType ?? "").toLowerCase();
  if (sec.includes("field recording") && !hit.includes("field-recordings")) {
    hit.push("field-recordings");
  }
  if (sec.includes("spoken") && !hit.includes("spoken-word")) {
    hit.push("spoken-word");
  }
  return hit;
}

export function tasteOverlap(inferred: string[], taste: string[]): string[] {
  const set = new Set(taste);
  return inferred.filter((id) => set.has(id));
}
