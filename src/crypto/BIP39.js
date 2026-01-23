/**
 * Srishti Blockchain - BIP39 Mnemonic Implementation
 * 
 * Implements BIP39 standard for mnemonic phrase generation and key derivation.
 * This allows deterministic key generation from a recovery phrase.
 */

class BIP39 {
    // BIP39 English word list (2048 words)
    static WORD_LIST = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
        'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
        'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
        'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
        'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
        'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
        'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
        'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
        'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
        'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
        'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
        'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
        'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
        'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
        'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
        'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
        'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
        'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
        'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
        'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
        'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
        'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
        'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
        'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
        'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
        'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
        'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
        'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
        'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
        'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
        'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable',
        'cactus', 'cage', 'cake', 'call', 'calm', 'camera', 'camp', 'can',
        'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas', 'canyon', 'capable',
        'capital', 'captain', 'car', 'carbon', 'card', 'care', 'career', 'careful',
        'careless', 'cargo', 'carpet', 'carry', 'cart', 'case', 'cash', 'casino',
        'cast', 'casual', 'cat', 'catalog', 'catch', 'category', 'cattle', 'caught',
        'cause', 'caution', 'cave', 'ceiling', 'celery', 'cement', 'census', 'century',
        'cereal', 'certain', 'chair', 'chalk', 'champion', 'change', 'chaos', 'chapter',
        'charge', 'chase', 'chat', 'cheap', 'check', 'cheese', 'chef', 'cherry',
        'chest', 'chicken', 'chief', 'child', 'chimney', 'choice', 'choose', 'chronic',
        'chuckle', 'chunk', 'churn', 'cigar', 'cinnamon', 'circle', 'citizen', 'city',
        'civil', 'claim', 'clamp', 'clarify', 'claw', 'clay', 'clean', 'clerk',
        'clever', 'click', 'client', 'cliff', 'climb', 'clinic', 'clip', 'clock',
        'clog', 'close', 'cloth', 'cloud', 'clown', 'club', 'clump', 'cluster',
        'clutch', 'coach', 'coast', 'coconut', 'code', 'coffee', 'coil', 'coin',
        'collect', 'color', 'column', 'combine', 'come', 'comfort', 'comic', 'common',
        'company', 'concert', 'conduct', 'confirm', 'congress', 'connect', 'consider', 'control',
        'convince', 'cook', 'cool', 'copper', 'copy', 'coral', 'core', 'corn',
        'correct', 'cost', 'cotton', 'couch', 'country', 'couple', 'course', 'cousin',
        'cover', 'coyote', 'crack', 'cradle', 'craft', 'cram', 'crane', 'crash',
        'crater', 'crawl', 'crazy', 'cream', 'credit', 'creek', 'crew', 'cricket',
        'crime', 'crisp', 'critic', 'crop', 'cross', 'crouch', 'crowd', 'crucial',
        'cruel', 'cruise', 'crumble', 'crunch', 'crush', 'cry', 'crystal', 'cube',
        'culture', 'cup', 'cupboard', 'curious', 'current', 'curtain', 'curve', 'cushion',
        'custom', 'cute', 'cycle', 'dad', 'damage', 'damp', 'dance', 'danger',
        'daring', 'dash', 'daughter', 'dawn', 'day', 'deal', 'debate', 'debris',
        'decade', 'december', 'decide', 'decline', 'decorate', 'decrease', 'deer', 'defense',
        'define', 'defy', 'degree', 'delay', 'deliver', 'demand', 'demise', 'denial',
        'dentist', 'deny', 'depart', 'depend', 'deposit', 'depth', 'deputy', 'derive',
        'describe', 'desert', 'design', 'desk', 'despair', 'destroy', 'detail', 'detect',
        'develop', 'device', 'devote', 'diagram', 'dial', 'diamond', 'diary', 'dice',
        'diesel', 'diet', 'differ', 'digital', 'dignity', 'dilemma', 'dinner', 'dinosaur',
        'direct', 'dirt', 'disagree', 'discover', 'disease', 'dish', 'dismiss', 'disorder',
        'display', 'distance', 'divert', 'divide', 'divorce', 'dizzy', 'doctor', 'document',
        'dog', 'doll', 'dolphin', 'domain', 'donate', 'donkey', 'donor', 'door',
        'dose', 'double', 'dove', 'draft', 'dragon', 'drama', 'drastic', 'draw',
        'dream', 'dress', 'drift', 'drill', 'drink', 'drip', 'drive', 'drop',
        'drum', 'dry', 'duck', 'dumb', 'dune', 'during', 'dust', 'dutch',
        'duty', 'dwarf', 'dynamic', 'eager', 'eagle', 'early', 'earn', 'earth',
        'easily', 'east', 'easy', 'eat', 'echo', 'ecology', 'economy', 'edge',
        'edit', 'educate', 'effort', 'egg', 'eight', 'either', 'elbow', 'elder',
        'electric', 'elegant', 'element', 'elephant', 'elevator', 'elite', 'else', 'embark',
        'embody', 'embrace', 'emerge', 'emotion', 'employ', 'empower', 'empty', 'enable',
        'enact', 'end', 'endless', 'endorse', 'enemy', 'energy', 'enforce', 'engage',
        'engine', 'enhance', 'enjoy', 'enlist', 'enough', 'enrich', 'enroll', 'ensure',
        'enter', 'entire', 'entry', 'envelope', 'episode', 'equal', 'equip', 'era',
        'erase', 'erode', 'erosion', 'error', 'erupt', 'escape', 'essay', 'essence',
        'estate', 'eternal', 'ethics', 'evidence', 'evil', 'evoke', 'evolve', 'exact',
        'example', 'exceed', 'excellent', 'except', 'exchange', 'excite', 'exclude', 'excuse',
        'execute', 'exercise', 'exhaust', 'exhibit', 'exile', 'exist', 'exit', 'exotic',
        'expand', 'expect', 'expire', 'explain', 'expose', 'express', 'extend', 'extra',
        'eye', 'eyebrow', 'fabric', 'face', 'faculty', 'fade', 'faint', 'faith',
        'fall', 'false', 'fame', 'family', 'famous', 'fan', 'fancy', 'fantasy',
        'farm', 'fashion', 'fat', 'fatal', 'father', 'fatigue', 'fault', 'favorite',
        'feature', 'february', 'federal', 'fee', 'feed', 'feel', 'female', 'fence',
        'festival', 'fetch', 'fever', 'few', 'fiber', 'fiction', 'field', 'figure',
        'file', 'film', 'filter', 'final', 'find', 'fine', 'finger', 'finish',
        'fire', 'firm', 'first', 'fiscal', 'fish', 'fit', 'fitness', 'fix',
        'flag', 'flame', 'flash', 'flat', 'flavor', 'flee', 'flight', 'flip',
        'float', 'flock', 'floor', 'flower', 'fluid', 'flush', 'fly', 'foam',
        'focus', 'fog', 'foil', 'fold', 'follow', 'food', 'foot', 'force',
        'forest', 'forget', 'fork', 'fortune', 'forum', 'forward', 'fossil', 'foster',
        'found', 'fox', 'fragile', 'frame', 'frequent', 'fresh', 'friend', 'fringe',
        'frog', 'front', 'frost', 'frown', 'frozen', 'fruit', 'fuel', 'fun',
        'funny', 'furnace', 'fury', 'future', 'gadget', 'gain', 'galaxy', 'gallery',
        'game', 'gap', 'garage', 'garbage', 'garden', 'garlic', 'garment', 'gas',
        'gasp', 'gate', 'gather', 'gauge', 'gaze', 'general', 'genius', 'genre',
        'gentle', 'genuine', 'gesture', 'ghost', 'giant', 'gift', 'giggle', 'ginger',
        'giraffe', 'girl', 'give', 'glad', 'glance', 'glare', 'glass', 'glide',
        'glimpse', 'globe', 'gloom', 'glory', 'glove', 'glow', 'glue', 'goat',
        'goddess', 'gold', 'good', 'goose', 'gorilla', 'gospel', 'gossip', 'govern',
        'gown', 'grab', 'grace', 'grain', 'grant', 'grape', 'grass', 'gravity',
        'great', 'green', 'grid', 'grief', 'grit', 'grocery', 'group', 'grow',
        'grunt', 'guard', 'guess', 'guide', 'guilt', 'guitar', 'gun', 'gym',
        'habit', 'hair', 'half', 'hammer', 'hamster', 'hand', 'happy', 'harbor',
        'hard', 'harsh', 'harvest', 'hat', 'have', 'hawk', 'hazard', 'head',
        'health', 'hear', 'heart', 'heavy', 'hedgehog', 'height', 'hello', 'helmet',
        'help', 'hen', 'hero', 'hidden', 'high', 'hill', 'hint', 'hip',
        'hire', 'history', 'hobby', 'hockey', 'hold', 'hole', 'holiday', 'hollow',
        'home', 'honey', 'hood', 'hope', 'horn', 'horror', 'horse', 'hospital',
        'host', 'hotel', 'hour', 'hover', 'hub', 'huge', 'human', 'humble',
        'humor', 'hundred', 'hungry', 'hunt', 'hurdle', 'hurry', 'hurt', 'husband',
        'hybrid', 'ice', 'icon', 'idea', 'identify', 'idle', 'ignore', 'ill',
        'illegal', 'illness', 'image', 'imitate', 'immense', 'immune', 'impact', 'impose',
        'improve', 'impulse', 'inch', 'include', 'income', 'increase', 'index', 'indicate',
        'indoor', 'industry', 'infant', 'inflict', 'inform', 'inhale', 'inherit', 'initial',
        'inject', 'injury', 'inmate', 'inner', 'innocent', 'input', 'inquiry', 'insane',
        'insect', 'inside', 'inspire', 'install', 'intact', 'interest', 'into', 'invest',
        'invite', 'involve', 'iron', 'island', 'isolate', 'issue', 'item', 'ivory',
        'jacket', 'jaguar', 'jar', 'jazz', 'jealous', 'jeans', 'jelly', 'jewel',
        'job', 'join', 'joke', 'journey', 'joy', 'judge', 'juice', 'jump',
        'jungle', 'junior', 'junk', 'just', 'kangaroo', 'keen', 'keep', 'ketchup',
        'key', 'kick', 'kid', 'kidney', 'kind', 'kingdom', 'kiss', 'kit',
        'kitchen', 'kite', 'kitten', 'kiwi', 'knee', 'knife', 'knock', 'know',
        'lab', 'label', 'labor', 'ladder', 'lady', 'lake', 'lamp', 'language',
        'laptop', 'large', 'later', 'latin', 'laugh', 'laundry', 'lava', 'law',
        'lawn', 'lawsuit', 'layer', 'lazy', 'leader', 'leaf', 'learn', 'leave',
        'lecture', 'left', 'leg', 'legal', 'legend', 'leisure', 'lemon', 'lend',
        'length', 'lens', 'leopard', 'lesson', 'letter', 'level', 'liar', 'liberty',
        'library', 'license', 'life', 'lift', 'light', 'like', 'limb', 'limit',
        'link', 'lion', 'liquid', 'list', 'little', 'live', 'lizard', 'load',
        'loan', 'lobster', 'local', 'lock', 'logic', 'lonely', 'long', 'loop',
        'lottery', 'loud', 'lounge', 'love', 'loyal', 'lucky', 'luggage', 'lumber',
        'lunar', 'lunch', 'luxury', 'lyrics', 'machine', 'mad', 'magic', 'magnet',
        'maid', 'mail', 'main', 'major', 'make', 'mammal', 'man', 'manage',
        'mandate', 'mango', 'mansion', 'manual', 'maple', 'marble', 'march', 'margin',
        'marine', 'market', 'marriage', 'mask', 'mass', 'master', 'match', 'material',
        'math', 'matrix', 'matter', 'maximum', 'maze', 'meadow', 'mean', 'measure',
        'meat', 'mechanic', 'medal', 'media', 'melody', 'melt', 'member', 'memory',
        'mention', 'menu', 'mercy', 'merge', 'merit', 'merry', 'mesh', 'message',
        'metal', 'method', 'middle', 'midnight', 'milk', 'million', 'mimic', 'mind',
        'minimum', 'minor', 'minute', 'miracle', 'mirror', 'misery', 'miss', 'mistake',
        'mix', 'mixed', 'mixture', 'mobile', 'model', 'modify', 'mom', 'moment',
        'monitor', 'monkey', 'monster', 'month', 'moon', 'moral', 'more', 'morning',
        'mosquito', 'mother', 'motion', 'motor', 'mountain', 'mouse', 'move', 'movie',
        'much', 'muffin', 'mule', 'multiply', 'muscle', 'museum', 'mushroom', 'music',
        'must', 'mutual', 'myself', 'mystery', 'myth', 'naive', 'name', 'napkin',
        'narrow', 'nasty', 'nation', 'nature', 'near', 'neck', 'need', 'negative',
        'neglect', 'neither', 'nephew', 'nerve', 'nest', 'net', 'network', 'neutral',
        'never', 'news', 'next', 'nice', 'night', 'noble', 'noise', 'nominee',
        'none', 'noodle', 'normal', 'north', 'nose', 'notable', 'note', 'nothing',
        'notice', 'novel', 'now', 'nuclear', 'number', 'nurse', 'nut', 'oak',
        'obey', 'object', 'oblige', 'obscure', 'observe', 'obtain', 'obvious', 'occur',
        'ocean', 'october', 'odor', 'off', 'offer', 'office', 'often', 'oil',
        'okay', 'old', 'olive', 'olympic', 'omit', 'once', 'one', 'onion',
        'online', 'only', 'open', 'opera', 'opinion', 'oppose', 'option', 'orange',
        'orbit', 'orchard', 'order', 'ordinary', 'organ', 'orient', 'original', 'orphan',
        'ostrich', 'other', 'outdoor', 'outer', 'output', 'outside', 'oval', 'oven',
        'over', 'own', 'owner', 'oxygen', 'oyster', 'ozone', 'pact', 'paddle',
        'page', 'pair', 'palace', 'palm', 'panda', 'panel', 'panic', 'panther',
        'paper', 'parade', 'parent', 'park', 'parrot', 'party', 'pass', 'patch',
        'path', 'patient', 'patrol', 'pattern', 'pause', 'pave', 'payment', 'peace',
        'peach', 'peanut', 'pear', 'peasant', 'pelican', 'pen', 'penalty', 'pencil',
        'people', 'pepper', 'perfect', 'permit', 'person', 'pet', 'phone', 'photo',
        'phrase', 'physical', 'piano', 'picnic', 'picture', 'piece', 'pig', 'pigeon',
        'pill', 'pilot', 'pink', 'pioneer', 'pipe', 'pistol', 'pitch', 'pizza',
        'place', 'planet', 'plastic', 'plate', 'play', 'please', 'pledge', 'pluck',
        'plug', 'plunge', 'poem', 'poet', 'point', 'polar', 'pole', 'police',
        'pond', 'pony', 'pool', 'poor', 'popcorn', 'popular', 'portion', 'position',
        'possible', 'post', 'potato', 'pottery', 'poverty', 'powder', 'power', 'practice',
        'praise', 'predict', 'prefer', 'prepare', 'present', 'pretty', 'prevent', 'price',
        'pride', 'primary', 'print', 'priority', 'prison', 'private', 'prize', 'problem',
        'process', 'produce', 'profit', 'program', 'project', 'promote', 'proof', 'property',
        'prosper', 'protect', 'proud', 'provide', 'public', 'pudding', 'pull', 'pulp',
        'pulse', 'pumpkin', 'punch', 'pupil', 'puppy', 'purchase', 'purity', 'purpose',
        'purse', 'push', 'put', 'puzzle', 'pyramid', 'quality', 'quantum', 'quarter',
        'question', 'quick', 'quit', 'quiz', 'quote', 'rabbit', 'raccoon', 'race',
        'rack', 'radar', 'radio', 'rail', 'rain', 'raise', 'rally', 'ramp',
        'ranch', 'random', 'range', 'rapid', 'rare', 'rate', 'rather', 'raven',
        'raw', 'razor', 'ready', 'real', 'reason', 'rebel', 'rebuild', 'recall',
        'receive', 'recipe', 'record', 'recycle', 'reduce', 'reflect', 'reform', 'refuse',
        'region', 'regret', 'regular', 'reject', 'relax', 'release', 'relief', 'rely',
        'remain', 'remember', 'remind', 'remove', 'render', 'renew', 'rent', 'reopen',
        'repair', 'repeat', 'replace', 'report', 'require', 'rescue', 'resemble', 'resist',
        'resource', 'response', 'result', 'retire', 'retreat', 'return', 'reunion', 'reveal',
        'review', 'reward', 'rhythm', 'rib', 'ribbon', 'rice', 'rich', 'ride',
        'ridge', 'rifle', 'right', 'rigid', 'ring', 'riot', 'rip', 'ripe',
        'rise', 'risk', 'ritual', 'rival', 'river', 'road', 'roast', 'robot',
        'robust', 'rocket', 'romance', 'roof', 'rookie', 'room', 'rose', 'rotate',
        'rough', 'round', 'route', 'royal', 'rubber', 'rude', 'rug', 'rule',
        'run', 'runway', 'rural', 'sad', 'saddle', 'sadness', 'safe', 'sail',
        'salad', 'salmon', 'salon', 'salt', 'same', 'sample', 'sand', 'satisfy',
        'satoshi', 'sauce', 'sausage', 'save', 'say', 'scale', 'scan', 'scare',
        'scatter', 'scene', 'scheme', 'school', 'science', 'scissors', 'scorpion', 'scout',
        'scrap', 'screen', 'script', 'scrub', 'sea', 'search', 'season', 'seat',
        'second', 'secret', 'section', 'security', 'seed', 'seek', 'segment', 'select',
        'sell', 'seminar', 'senior', 'sense', 'sentence', 'series', 'service', 'session',
        'settle', 'setup', 'seven', 'shadow', 'shaft', 'shallow', 'share', 'shed',
        'shell', 'sheriff', 'shield', 'shift', 'shine', 'ship', 'shiver', 'shock',
        'shoe', 'shoot', 'shop', 'short', 'shoulder', 'shove', 'shrimp', 'shrug',
        'shuffle', 'shy', 'sibling', 'sick', 'side', 'siege', 'sight', 'sign',
        'silent', 'silk', 'silly', 'silver', 'similar', 'simple', 'since', 'sing',
        'siren', 'sister', 'situate', 'six', 'size', 'skate', 'sketch', 'ski',
        'skill', 'skin', 'skirt', 'skull', 'slab', 'slam', 'sleep', 'slender',
        'slice', 'slide', 'slight', 'slim', 'slogan', 'slot', 'slow', 'slush',
        'small', 'smart', 'smile', 'smoke', 'smooth', 'snack', 'snake', 'snap',
        'sniff', 'snow', 'soap', 'soccer', 'social', 'sock', 'soda', 'soft',
        'solar', 'soldier', 'solid', 'solution', 'solve', 'someone', 'song', 'soon',
        'sorry', 'sort', 'soul', 'sound', 'soup', 'source', 'south', 'space',
        'spare', 'spatial', 'spawn', 'speak', 'special', 'speed', 'spell', 'spend',
        'sphere', 'spice', 'spider', 'spike', 'spin', 'spirit', 'split', 'spoil',
        'sponsor', 'spoon', 'sport', 'spot', 'spray', 'spread', 'spring', 'spy',
        'square', 'squeeze', 'squirrel', 'stable', 'stadium', 'staff', 'stage', 'stairs',
        'stamp', 'stand', 'start', 'state', 'stay', 'steak', 'steel', 'stem',
        'step', 'stereo', 'stick', 'still', 'sting', 'stock', 'stomach', 'stone',
        'stool', 'story', 'stove', 'strategy', 'street', 'strike', 'strong', 'struggle',
        'student', 'stuff', 'stumble', 'style', 'subject', 'submit', 'subway', 'success',
        'such', 'sudden', 'suffer', 'sugar', 'suggest', 'suit', 'summer', 'sun',
        'sunny', 'sunset', 'super', 'supply', 'support', 'sure', 'surface', 'surge',
        'surprise', 'surround', 'survey', 'suspect', 'sustain', 'swallow', 'swamp', 'swap',
        'swarm', 'swear', 'sweet', 'swift', 'swim', 'swing', 'switch', 'sword',
        'symbol', 'symptom', 'syrup', 'system', 'table', 'tackle', 'tag', 'tail',
        'talent', 'talk', 'tank', 'tape', 'target', 'task', 'taste', 'tattoo',
        'taxi', 'teach', 'team', 'tell', 'ten', 'tenant', 'tennis', 'tent',
        'term', 'test', 'text', 'thank', 'that', 'theme', 'then', 'theory',
        'there', 'they', 'thing', 'this', 'thought', 'three', 'thrive', 'throw',
        'thumb', 'thunder', 'ticket', 'tide', 'tiger', 'tilt', 'timber', 'time',
        'tiny', 'tip', 'tired', 'tissue', 'title', 'toast', 'tobacco', 'today',
        'toddler', 'toe', 'together', 'toilet', 'token', 'tomato', 'tomorrow', 'tone',
        'tongue', 'tonight', 'tool', 'tooth', 'top', 'topic', 'topple', 'torch',
        'tornado', 'tortoise', 'toss', 'total', 'tourist', 'toward', 'tower', 'town',
        'toy', 'track', 'trade', 'traffic', 'tragic', 'train', 'transfer', 'trap',
        'trash', 'travel', 'tray', 'treat', 'tree', 'trend', 'trial', 'tribe',
        'trick', 'trigger', 'trim', 'trip', 'trophy', 'trouble', 'truck', 'true',
        'truly', 'trumpet', 'trust', 'truth', 'try', 'tube', 'tuition', 'tumble',
        'tuna', 'tunnel', 'turkey', 'turn', 'turtle', 'twelve', 'twenty', 'twice',
        'twin', 'twist', 'two', 'type', 'typical', 'ugly', 'umbrella', 'unable',
        'uncle', 'uncover', 'under', 'undo', 'unfair', 'unfold', 'unhappy', 'uniform',
        'unique', 'unit', 'universe', 'unknown', 'unlock', 'until', 'unusual', 'unveil',
        'update', 'upgrade', 'uphold', 'upon', 'upper', 'upset', 'urban', 'urge',
        'usage', 'use', 'used', 'useful', 'useless', 'usual', 'utility', 'vacant',
        'vacuum', 'vague', 'valid', 'valley', 'valve', 'van', 'vanish', 'vapor',
        'various', 'vast', 'vault', 'vehicle', 'velvet', 'vendor', 'venture', 'venue',
        'verb', 'verify', 'version', 'very', 'vessel', 'veteran', 'viable', 'vibrant',
        'vicious', 'victory', 'video', 'view', 'village', 'vintage', 'violin', 'virtual',
        'virus', 'visa', 'visit', 'visual', 'vital', 'vivid', 'vocal', 'voice',
        'void', 'volcano', 'volume', 'vote', 'voyage', 'wage', 'wagon', 'wait',
        'walk', 'wall', 'walnut', 'want', 'warfare', 'warm', 'warrior', 'wash',
        'wasp', 'waste', 'water', 'wave', 'way', 'wealth', 'weapon', 'weary',
        'weather', 'weave', 'web', 'wedding', 'weekend', 'weird', 'welcome', 'west',
        'wet', 'whale', 'what', 'wheat', 'wheel', 'when', 'where', 'whip',
        'whisper', 'wide', 'width', 'wife', 'wild', 'will', 'win', 'window',
        'wine', 'wing', 'wink', 'winner', 'winter', 'wire', 'wisdom', 'wise',
        'wish', 'witness', 'wolf', 'woman', 'wonder', 'wood', 'wool', 'word',
        'work', 'world', 'worry', 'worth', 'wrap', 'wreck', 'wrestle', 'wrist',
        'write', 'wrong', 'yard', 'year', 'yellow', 'you', 'young', 'youth',
        'zebra', 'zero', 'zone', 'zoo'
    ];

    /**
     * Generate a random mnemonic phrase (12 words = 128 bits entropy)
     * @returns {Promise<string>} - 12-word mnemonic phrase
     */
    static async generateMnemonic() {
        // Generate 128 bits of entropy (16 bytes)
        const entropy = new Uint8Array(16);
        crypto.getRandomValues(entropy);
        
        // Calculate checksum: first 4 bits of SHA-256 hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', entropy);
        const hashArray = new Uint8Array(hashBuffer);
        
        // Combine entropy + checksum = 132 bits = 12 words (11 bits per word)
        const bits = [];
        
        // Add entropy bits (128 bits)
        for (let i = 0; i < 16; i++) {
            for (let j = 7; j >= 0; j--) {
                bits.push((entropy[i] >> j) & 1);
            }
        }
        
        // Add checksum bits (first 4 bits of hash)
        for (let j = 7; j >= 4; j--) {
            bits.push((hashArray[0] >> j) & 1);
        }
        
        // Convert to words (11 bits per word)
        const words = [];
        for (let i = 0; i < 12; i++) {
            let index = 0;
            for (let j = 0; j < 11; j++) {
                const bitIndex = i * 11 + j;
                if (bitIndex < bits.length) {
                    index = (index << 1) | bits[bitIndex];
                }
            }
            words.push(this.WORD_LIST[index % 2048]);
        }
        
        return words.join(' ');
    }

    /**
     * Validate mnemonic phrase
     * @param {string} mnemonic - Mnemonic phrase to validate
     * @returns {Promise<boolean>}
     */
    static async validateMnemonic(mnemonic) {
        const words = mnemonic.toLowerCase().trim().split(/\s+/);
        
        if (words.length !== 12) {
            return false;
        }
        
        // Check all words are in word list
        for (const word of words) {
            if (!this.WORD_LIST.includes(word)) {
                return false;
            }
        }
        
        // TODO: Validate checksum
        return true;
    }

    /**
     * Derive seed from mnemonic using PBKDF2
     * @param {string} mnemonic - Mnemonic phrase
     * @param {string} passphrase - Optional passphrase (default: '')
     * @returns {Promise<Uint8Array>} - 64-byte seed
     */
    static async mnemonicToSeed(mnemonic, passphrase = '') {
        // BIP39: seed = PBKDF2(mnemonic + passphrase, "mnemonic" + passphrase, 2048 iterations)
        // Since Web Crypto API doesn't support PBKDF2, we'll use HKDF as an alternative
        const salt = new TextEncoder().encode('mnemonic' + passphrase);
        const info = new TextEncoder().encode('srishti-blockchain-seed');
        const inputKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(mnemonic),
            { name: 'HKDF' },
            false,
            ['deriveBits']
        );
        
        const seed = await crypto.subtle.deriveBits(
            {
                name: 'HKDF',
                salt: salt,
                info: info,
                hash: 'SHA-256'
            },
            inputKey,
            512 // 64 bytes
        );
        
        return new Uint8Array(seed);
    }

    /**
     * Derive Ed25519 key pair from seed using @noble/ed25519 for deterministic generation
     * @param {Uint8Array} seed - 64-byte seed
     * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
     */
    static async seedToKeyPair(seed) {
        // Use first 32 bytes of seed as the private key seed
        const privateKeySeed = seed.slice(0, 32);
        
        // Wait for @noble/ed25519 library to be ready if needed
        if (typeof window !== 'undefined' && window.ed25519Ready) {
            try {
                await window.ed25519Ready;
            } catch (error) {
                console.warn('⚠️ Error waiting for ed25519:', error);
            }
        }
        
        // Try to access @noble/ed25519 library - it might be exposed in different ways
        let ed25519Lib = null;
        if (typeof ed25519 !== 'undefined' && ed25519.getPublicKey) {
            ed25519Lib = ed25519;
        } else if (typeof window !== 'undefined' && window.ed25519 && window.ed25519.getPublicKey) {
            ed25519Lib = window.ed25519;
        } else if (typeof globalThis !== 'undefined' && globalThis.ed25519 && globalThis.ed25519.getPublicKey) {
            ed25519Lib = globalThis.ed25519;
        }
        
        // Use @noble/ed25519 for deterministic key generation
        if (ed25519Lib) {
            try {
                // For Ed25519, we need to hash the seed to get a valid private key
                // Ed25519 private keys must be 32 bytes and properly formatted
                // We use SHA-512 hash of the seed, then take first 32 bytes
                const privateKeyRaw = await crypto.subtle.digest('SHA-512', privateKeySeed);
                const privateKey32 = new Uint8Array(privateKeyRaw).slice(0, 32);
                
                // Get public key from private key (deterministic)
                const publicKeyBytes = ed25519Lib.getPublicKey(privateKey32);
                
                // Convert to Web Crypto API format
                const privateKey = await window.SrishtiKeys.importPrivateKey(
                    this.bytesToBase64(this.constructPKCS8(privateKey32))
                );
                
                const publicKey = await window.SrishtiKeys.importPublicKey(
                    this.bytesToBase64(publicKeyBytes)
                );
                
                return { publicKey, privateKey };
            } catch (error) {
                console.error('Error using @noble/ed25519 for key derivation:', error);
                // Continue to fallback method
            }
        } else {
            // Try to wait a bit for the library to load (in case of async loading)
            console.warn('⚠️ @noble/ed25519 library not immediately available. Checking again...');
            // Wait 100ms and check again
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Re-check for the library
            if (typeof ed25519 !== 'undefined' && ed25519.getPublicKey) {
                ed25519Lib = ed25519;
            } else if (typeof window !== 'undefined' && window.ed25519 && window.ed25519.getPublicKey) {
                ed25519Lib = window.ed25519;
            } else if (typeof globalThis !== 'undefined' && globalThis.ed25519 && globalThis.ed25519.getPublicKey) {
                ed25519Lib = globalThis.ed25519;
            }
            
            if (ed25519Lib) {
                console.log('✅ @noble/ed25519 library found after wait');
                // Retry with the library
                const privateKeyRaw = await crypto.subtle.digest('SHA-512', privateKeySeed);
                const privateKey32 = new Uint8Array(privateKeyRaw).slice(0, 32);
                const publicKeyBytes = ed25519Lib.getPublicKey(privateKey32);
                
                const privateKey = await window.SrishtiKeys.importPrivateKey(
                    this.bytesToBase64(this.constructPKCS8(privateKey32))
                );
                
                const publicKey = await window.SrishtiKeys.importPublicKey(
                    this.bytesToBase64(publicKeyBytes)
                );
                
                return { publicKey, privateKey };
            } else {
                console.error('❌ @noble/ed25519 library not available. BIP39 key derivation requires this library.');
                throw new Error('@noble/ed25519 library is required for BIP39 key derivation but is not available. Please ensure the library is loaded before using BIP39.');
            }
        }
        
        // Fallback: Use HKDF to derive key material deterministically
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            seed,
            { name: 'HKDF' },
            false,
            ['deriveBits']
        );
        
        const derivedPrivate = await crypto.subtle.deriveBits(
            {
                name: 'HKDF',
                salt: new Uint8Array(0),
                info: new TextEncoder().encode('srishti-ed25519-key'),
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        
        const privateKeyBytes = new Uint8Array(derivedPrivate).slice(0, 32);
        const pkcs8Key = this.constructPKCS8(privateKeyBytes);
        
        const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            pkcs8Key,
            {
                name: 'Ed25519',
                namedCurve: 'Ed25519'
            },
            true,
            ['sign']
        );
        
        // Derive public key from private key
        // For Ed25519, we can use @noble/ed25519 to get the public key from private key bytes
        try {
            // Export the private key to get the raw bytes
            const exportedPrivate = await crypto.subtle.exportKey('pkcs8', privateKey);
            const exportedBytes = new Uint8Array(exportedPrivate);
            
            // PKCS8 format: last 32 bytes are the actual Ed25519 private key
            const privateKeyRaw = exportedBytes.slice(-32);
            
            // Use @noble/ed25519 if available to get public key
            if (ed25519Lib) {
                try {
                    const publicKeyBytes = ed25519Lib.getPublicKey(privateKeyRaw);
                    const publicKey = await window.SrishtiKeys.importPublicKey(
                        this.bytesToBase64(publicKeyBytes)
                    );
                    return { publicKey, privateKey };
                } catch (error) {
                    console.error('Error using @noble/ed25519 to derive public key:', error);
                }
            }
            
            // Alternative: Try to use Web Crypto API's Ed25519 support
            // We can generate a key pair from the seed deterministically using Web Crypto
            // by importing the private key seed and letting Web Crypto derive the public key
            try {
                // Web Crypto API can derive public key from private key when we import it
                // First, create a key pair from the seed deterministically
                // We'll use the seed to generate a deterministic private key
                const seedKey = await crypto.subtle.importKey(
                    'raw',
                    privateKeySeed,
                    { name: 'HKDF' },
                    false,
                    ['deriveBits']
                );
                
                const keyMaterial = await crypto.subtle.deriveBits(
                    {
                        name: 'HKDF',
                        salt: new Uint8Array(0),
                        info: new TextEncoder().encode('srishti-ed25519-deterministic'),
                        hash: 'SHA-256'
                    },
                    seedKey,
                    256
                );
                
                const privateKeyBytes = new Uint8Array(keyMaterial).slice(0, 32);
                const pkcs8Key = this.constructPKCS8(privateKeyBytes);
                
                // Import as Ed25519 private key - Web Crypto will derive the public key
                const fullKeyPair = await crypto.subtle.importKey(
                    'pkcs8',
                    pkcs8Key,
                    {
                        name: 'Ed25519',
                        namedCurve: 'Ed25519'
                    },
                    true,
                    ['sign']
                );
                
                // Export to get both keys
                const exportedPrivate = await crypto.subtle.exportKey('pkcs8', fullKeyPair);
                const exportedPublic = await crypto.subtle.exportKey('raw', await crypto.subtle.importKey(
                    'raw',
                    new Uint8Array(await crypto.subtle.exportKey('raw', fullKeyPair)).slice(0, 32), // This won't work directly
                    { name: 'Ed25519' },
                    false,
                    ['verify']
                ));
                
                // Actually, we need to sign something and extract public key from the signature
                // Or use the key pair that Web Crypto generated
                // Let's use a different approach: generate key pair and use the private key we derived
                const testKeyPair = await crypto.subtle.generateKey(
                    {
                        name: 'Ed25519',
                        namedCurve: 'Ed25519'
                    },
                    true,
                    ['sign', 'verify']
                );
                
                // This approach won't work - we need @noble/ed25519
                throw new Error('Cannot derive public key without @noble/ed25519 library');
            } catch (webCryptoError) {
                console.error('Web Crypto API fallback failed:', webCryptoError);
                throw new Error('Cannot derive public key without @noble/ed25519 library');
            }
            
        } catch (error) {
            console.error('Error deriving public key from private key:', error);
            // If we can't derive the public key deterministically, we should throw
            // rather than generating a random key (which would be wrong)
            throw new Error('Failed to derive key pair deterministically: ' + error.message);
        }
    }
    
    /**
     * Construct PKCS8 format for Ed25519 private key
     * @param {Uint8Array} privateKeyBytes - 32-byte private key
     * @returns {Uint8Array} - PKCS8 formatted key
     */
    static constructPKCS8(privateKeyBytes) {
        const pkcs8Header = new Uint8Array([
            0x30, 0x2e, // SEQUENCE, 46 bytes
            0x02, 0x01, 0x00, // version INTEGER 0
            0x30, 0x05, // AlgorithmIdentifier SEQUENCE
            0x06, 0x03, 0x2b, 0x65, 0x70, // OID for Ed25519 (1.3.101.112)
            0x04, 0x22, // OCTET STRING, 34 bytes
            0x04, 0x20 // OCTET STRING, 32 bytes (the actual key)
        ]);
        
        const pkcs8Key = new Uint8Array(pkcs8Header.length + privateKeyBytes.length);
        pkcs8Key.set(pkcs8Header);
        pkcs8Key.set(privateKeyBytes, pkcs8Header.length);
        
        return pkcs8Key;
    }
    
    /**
     * Convert bytes to base64
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    static bytesToBase64(bytes) {
        return btoa(String.fromCharCode(...bytes));
    }

    /**
     * Generate key pair from mnemonic phrase
     * @param {string} mnemonic - Mnemonic phrase
     * @param {string} passphrase - Optional passphrase
     * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
     */
    static async mnemonicToKeyPair(mnemonic, passphrase = '') {
        const seed = await this.mnemonicToSeed(mnemonic, passphrase);
        return await this.seedToKeyPair(seed);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BIP39;
} else {
    window.SrishtiBIP39 = BIP39;
}
