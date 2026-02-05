/* ======================================================
   CONFIGURACIÓ
====================================================== */
const COLOR_STORAGE_KEY = "ulaGameColors";
const STATS_STORAGE_KEY = "ulaStats";
const FAV_STORAGE_KEY = "ulaFavorites";
// Al inicio del archivo, después de las constantes
const ELECTRON_CACHE = window.desktopCache || null;
const IS_ELECTRON = window.appEnvironment ? window.appEnvironment.isElectron : false;

/* ======================================================
   CONFIGURACIÓ DE SEGURETAT - REVISADA
====================================================== */
const SECURITY_CONFIG = {
    // Permetre tots els jocs ja que són de tercers
    SANDBOX_ATTRIBUTES: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock allow-orientation-lock allow-presentation',
    ADDITIONAL_ATTRIBUTES: {
        referrerpolicy: 'no-referrer-when-downgrade',
        allow: 'fullscreen; gamepad;',
    }
};

/* ======================================================
   PALETA DE COLORS
====================================================== */
const COLORS = [
  "#FF0000", "#FF4757", "#EE5253", "#FF003F", "#D63031", "#F368E0", "#FF00FF", "#E84393", "#FD79A8", "#FF0080",
  "#6C5CE7", "#8E44AD", "#A29BFE", "#6F1E51", "#5F27CD", "#9B59B6", "#82589F", "#5533FF", "#BF00FF", "#4834D4",
  "#007AFF", "#0984E3", "#00D2D3", "#0ABDE3", "#2E86DE", "#00CEC9", "#240BFF", "#12CBC4", "#00FFFF", "#341F97",
  "#00FF00", "#1DD1A1", "#10AC84", "#2ECC71", "#00B894", "#B8E994", "#78E08F", "#05C46B", "#32FF7E", "#26DE81",
  "#FF9F43", "#F1C40F", "#FF9F1C", "#F39C12", "#E67E22", "#FF3300", "#F9CA24", "#FA8231", "#E58E26", "#FFFA00",
  "#FF0055", "#00FFCC", "#33FF00", "#5500FF", "#FFCC00", "#FF00AA", "#00AAFF", "#AAFF00", "#FF5500", "#0055FF"
];

/* ======================================================
   COMPROVACIÓ DE CACHE - PER AL LOADER
====================================================== */
function checkCacheStatus() {
    try {
        const cacheData = localStorage.getItem('game_images_base64_cache');
        if (!cacheData) return { total: 0, cached: 0 };
        
        const parsed = JSON.parse(cacheData);
        const games = typeof GAMES !== 'undefined' ? GAMES : [];
        let cachedCount = 0;
        
        games.forEach(game => {
            const cacheKey = `img_${game.url}`;
            if (parsed[cacheKey]) cachedCount++;
        });
        
        return { total: games.length, cached: cachedCount };
    } catch (e) {
        return { total: 0, cached: 0 };
    }
}

// Funció per obtenir el percentatge de cache
function getCachePercentage() {
    const status = checkCacheStatus();
    if (status.total === 0) return 0;
    return (status.cached / status.total) * 100;
}

/* ======================================================
   SISTEMA DE CACHE D'IMATGES (DESCARREGA I EMMAGATZEMATGE REAL)
====================================================== */

let IMAGE_CACHE_INITIALIZED = false;
const IMAGE_CACHE = new Map();
const MAX_CACHE_SIZE_MB = 20; // Límit de memòria per al cache

// Ordre exacte de formats a provar
const FORMAT_ORDER = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];

async function initializeImageCache() {
    if (IMAGE_CACHE_INITIALIZED) return;
    
    try {
        // Carregar cache d'imatges codificades en base64
        const cacheData = localStorage.getItem('game_images_base64_cache');
        if (cacheData) {
            const parsed = JSON.parse(cacheData);
            Object.entries(parsed).forEach(([key, value]) => {
                IMAGE_CACHE.set(key, value);
            });
            console.log(`Cache d'imatges inicialitzat: ${IMAGE_CACHE.size} imatges carregades`);
        }
    } catch (e) {
        console.warn("Error inicialitzant cache d'imatges:", e);
    }
    
    IMAGE_CACHE_INITIALIZED = true;
}

// Funció per obtenir la mida del localStorage
function getLocalStorageSize() {
    let total = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += localStorage[key].length * 2; // Cada caràcter = 2 bytes (UTF-16)
        }
    }
    return total / (1024 * 1024); // Convertir a MB
}

// Funció per netejar cache vell si superem el límit
function cleanupOldCacheIfNeeded(newItemSizeKB = 100) {
    try {
        const currentSizeMB = getLocalStorageSize();
        const cacheData = localStorage.getItem('game_images_base64_cache');
        
        if (!cacheData) return;
        
        const parsed = JSON.parse(cacheData);
        const cacheEntries = Object.entries(parsed);
        
        // Si superem el límit, eliminar les imatges més antigues
        if (currentSizeMB + (newItemSizeKB / 1024) > MAX_CACHE_SIZE_MB) {
            console.log(`Netejant cache d'imatges (${currentSizeMB.toFixed(2)}MB/${MAX_CACHE_SIZE_MB}MB)`);
            
            // Ordenar per data d'accés (més antigues primer)
            const cacheWithTimestamps = cacheEntries.map(([key, value]) => {
                const timestampKey = `img_timestamp_${key}`;
                const timestamp = parseInt(localStorage.getItem(timestampKey) || Date.now());
                return { key, value, timestamp };
            }).sort((a, b) => a.timestamp - b.timestamp);
            
            // Eliminar les més antigues fins a estar per sota del límit
            const targetSizeMB = MAX_CACHE_SIZE_MB * 0.7; // Objectiu: 70% del límit
            while (currentSizeMB > targetSizeMB && cacheWithTimestamps.length > 0) {
                const oldest = cacheWithTimestamps.shift();
                delete parsed[oldest.key];
                localStorage.removeItem(`img_timestamp_${oldest.key}`);
                console.log(`Eliminada imatge antiga del cache: ${oldest.key}`);
            }
            
            localStorage.setItem('game_images_base64_cache', JSON.stringify(parsed));
            IMAGE_CACHE.clear();
            Object.entries(parsed).forEach(([key, value]) => {
                IMAGE_CACHE.set(key, value);
            });
        }
    } catch (e) {
        console.warn("Error netejant cache:", e);
    }
}

// Descarregar imatge i convertir a base64
async function downloadImageToBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn(`Error descarregant imatge ${url}:`, error);
        return null;
    }
}

// Modificar la función findGameImage para usar el cache de Electron
async function findGameImage(gameUrl) {
  // Si estamos en Electron, usar el cache de escritorio
  if (IS_ELECTRON && ELECTRON_CACHE) {
    try {
      // Inicializar cache si no está inicializado
      if (!ELECTRON_CACHE.initialized) {
        await ELECTRON_CACHE.init();
      }
      
      // Buscar en cache primero
      const cachedImage = await ELECTRON_CACHE.getImage(gameUrl);
      if (cachedImage) {
        console.log(`Imatge obtinguda del cache d'Electron: ${gameUrl}`);
        return cachedImage; // Base64 desde Electron
      }
      
      // Si no está en cache, buscar en las rutas normales
      const baseName = gameUrl.replace('.html', '');
      const extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];
      
      for (const ext of extensions) {
        const imagePath = `assets/images/${baseName}.${ext}`;
        
        try {
          // Verificar si la imagen existe localmente
          const exists = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = imagePath;
          });
          
          if (exists) {
            // Guardar en cache de Electron para futuro uso
            const saved = await ELECTRON_CACHE.saveImage(gameUrl, imagePath);
            if (saved) {
              return saved;
            }
            // Si falla el guardado, retornar la URL directa
            return imagePath;
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Error con cache de Electron:', error);
      // Continuar con el método original
    }
  }
  
  // Método original (mantener para compatibilidad)
  await initializeImageCache();
  
  const cacheKey = `img_${gameUrl}`;
  const timestampKey = `img_timestamp_${cacheKey}`;
  
  if (IMAGE_CACHE.has(cacheKey)) {
    const cachedImage = IMAGE_CACHE.get(cacheKey);
    localStorage.setItem(timestampKey, Date.now().toString());
    return cachedImage;
  }
  
  const baseName = gameUrl.replace('.html', '');
  
  for (const ext of FORMAT_ORDER) {
    const path = `assets/images/${baseName}.${ext}`;
    
    try {
      const headResponse = await fetch(path, { method: 'HEAD' });
      if (headResponse.ok) {
        const base64Image = await downloadImageToBase64(path);
        
        if (base64Image) {
          const sizeKB = Math.ceil(base64Image.length / 1024 * 0.75);
          cleanupOldCacheIfNeeded(sizeKB);
          
          IMAGE_CACHE.set(cacheKey, base64Image);
          
          try {
            const cacheData = localStorage.getItem('game_images_base64_cache');
            const parsed = cacheData ? JSON.parse(cacheData) : {};
            parsed[cacheKey] = base64Image;
            localStorage.setItem('game_images_base64_cache', JSON.stringify(parsed));
            localStorage.setItem(timestampKey, Date.now().toString());
          } catch (e) {
            console.warn("Error guardant imatge al cache:", e);
          }
          
          return base64Image;
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

/* ======================================================
   SISTEMA DE FAVORITS
====================================================== */
const FavManager = {
    get() { return JSON.parse(localStorage.getItem(FAV_STORAGE_KEY) || "[]"); },
    toggle(gameUrl) {
        let favs = this.get();
        if (favs.includes(gameUrl)) favs = favs.filter(u => u !== gameUrl);
        else favs.push(gameUrl);
        localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favs));
        return favs.includes(gameUrl);
    },
    isFav(gameUrl) { return this.get().includes(gameUrl); }
};

/* ======================================================
   FUNCIÓ PER ORDENAR JOCS (FAVORITS PRIMER)
====================================================== */
function sortGamesByFavorites(games) {
    const favGames = [];
    const nonFavGames = [];
    
    // Separar en favoritos y no favoritos
    games.forEach(game => {
        if (FavManager.isFav(game.url)) {
            favGames.push(game);
        } else {
            nonFavGames.push(game);
        }
    });
    
    // Ordenar cada grupo alfabéticamente
    favGames.sort((a, b) => a.name.localeCompare(b.name));
    nonFavGames.sort((a, b) => a.name.localeCompare(b.name));
    
    // Devolver favoritos primero
    return [...favGames, ...nonFavGames];
}

/* ======================================================
   COLOR STORAGE
====================================================== */
function loadColors() { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || "{}"); }
function saveColors(obj) { localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(obj)); }
const GAME_COLORS = loadColors();

function getGameColor(game) {
    const key = game.url;
    if (!GAME_COLORS[key]) {
        GAME_COLORS[key] = COLORS[Math.floor(Math.random() * COLORS.length)];
        saveColors(GAME_COLORS);
    }
    return GAME_COLORS[key];
}

/* ======================================================
   STATS SYSTEM
====================================================== */
const StatsSystem = {
    load() {
        const data = localStorage.getItem(STATS_STORAGE_KEY);
        if (!data) return { totalTime: 0, totalSessions: 0, longestSession: 0, games: {} };
        return JSON.parse(data);
    },
    recordSession(game, seconds) {
        if (seconds < 1) return;
        let stats = this.load();
        const key = game.url;
        if (!stats.games[key]) stats.games[key] = { name: game.name, time: 0, sessions: 0, lastPlayedDate: "" };
        stats.games[key].time += seconds;
        stats.games[key].sessions += 1;
        stats.games[key].lastPlayedDate = new Date().toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        stats.totalTime += seconds;
        stats.totalSessions += 1;
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    }
};

/* ======================================================
   CORE JOC - AMB SKELETON LOADING
====================================================== */
const GameCore = {
    activeGame: null,
    startTime: 0,
    currentImageQueue: [],
    
    init() {
        // Solo inicializar si el DOM está listo y el loader ha terminado
        const checkInit = () => {
            this.cacheDOM();
            if (typeof GAMES !== 'undefined') {
                const sortedGames = sortGamesByFavorites(GAMES);
                this.renderWithSkeleton(sortedGames);
            }
            this.bindEvents();
            window.addEventListener("mousemove", (e) => this.moveAura(e));
            
            // Estas funciones pueden necesitar ajustes
            try {
                cleanupOldCacheIfNeeded();
                initializeImageCache();
            } catch (e) {
                console.warn('Error inicializando cache:', e);
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", checkInit);
        } else {
            checkInit();
        }
    },

    cacheDOM() {
        this.grid = document.getElementById("gamesGrid");
        this.searchInput = document.getElementById("searchInput");
        this.modal = document.getElementById("gameModal");
        this.aura = document.getElementById("cursorAura");
    },

    bindEvents() {
        if (this.searchInput) {
            this.searchInput.addEventListener("input", e => {
                const term = e.target.value.toLowerCase();
                const filtered = GAMES.filter(g => g.name.toLowerCase().includes(term));
                
                if (term.trim() === '') {
                    // Si no hay término de búsqueda, ordenar por favoritos
                    const sortedGames = sortGamesByFavorites(GAMES);
                    this.renderWithSkeleton(sortedGames);
                } else {
                    // Si hay búsqueda, mostrar resultados sin ordenar por favoritos
                    this.renderWithSkeleton(filtered);
                }
            });
        }
    },

    moveAura(e) {
        if (this.aura) {
            this.aura.style.left = e.clientX + "px";
            this.aura.style.top = e.clientY + "px";
        }
    },

    // Render amb skeleton loading
    async renderWithSkeleton(list) {
        if (!this.grid) return;
        
        this.showSkeletonGrid(list);
        
        setTimeout(() => {
            this.renderRealCards(list);
        }, 200);
    },
    
    showSkeletonGrid(list) {
        if (!this.grid) return;
        
        this.grid.innerHTML = "";
        this.grid.classList.add('skeleton-grid');
        
        if (!list || list.length === 0) return;
        
        const skeletonCount = Math.min(12, list.length);
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < skeletonCount; i++) {
            const skeletonCard = document.createElement("div");
            skeletonCard.className = "skeleton skeleton-card skeleton-grid-item";
            skeletonCard.style.animationDelay = `${i * 0.05}s`;
            fragment.appendChild(skeletonCard);
        }
        
        this.grid.appendChild(fragment);
    },

    async renderRealCards(list) {
        if (!this.grid) return;
        
        this.grid.classList.remove('skeleton-grid');
        this.grid.innerHTML = "";

        if (!list || list.length === 0) {
            this.grid.innerHTML = `<div class="no-games"><h3>No s'han trobat jocs</h3></div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        const imageQueue = [];

        list.forEach(game => {
            const color = getGameColor(game);
            const isFav = FavManager.isFav(game.url);
            const safeId = game.url.replace(/[^a-z0-9]/gi, '');
            
            const card = document.createElement("div");
            card.className = "card";
            card.setAttribute('data-game-url', game.url);
            
            card.innerHTML = `
                <div class="card-preview" onmousemove="GameCore.hover(event,this)">
                    <div class="card-fav ${isFav ? 'active' : ''}" onclick="GameCore.toggleFav(event, '${game.url}', this)">
                        <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                    </div>
                    <div class="card-image-container skeleton skeleton-image" id="img-cont-${safeId}">
                        <!-- Skeleton fins que es carregui la imatge -->
                    </div>
                    <div class="card-glow" style="--glow:${color}"></div>
                </div>
                <div class="card-info">
                    <div class="card-title">${game.name}</div>
                </div>
            `;

            card.onmouseenter = () => {
                document.documentElement.style.setProperty('--aura-color', `${color}66`);
                card.style.borderColor = color;
            };
            card.onmouseleave = () => {
                card.style.borderColor = 'rgba(255,255,255,0.7)';
            };
            card.onclick = (e) => {
                if(!e.target.closest('.card-fav')) this.launch(game);
            };

            // Crear objecte per a la cua d'imatges
            const cardData = {
                game,
                containerId: `img-cont-${safeId}`,
                loadImage: async () => {
                    await this.loadImageForCard(game, cardData.containerId);
                }
            };
            
            imageQueue.push(cardData);
            fragment.appendChild(card);
        });

        this.grid.appendChild(fragment);
        
        // Processar imatges seqüencialment (un joc a la vegada)
        this.processImageQueueSequentially(imageQueue);
    },

    // Processar cua d'imatges un a un
    async processImageQueueSequentially(queue) {
        for (let i = 0; i < queue.length; i++) {
            await queue[i].loadImage();
        }
    },

async loadImageForCard(game, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Obtindre la imatge en format base64
    const imageData = await findGameImage(game.url);

    container.classList.remove('skeleton', 'skeleton-image');
    
    if (imageData) {
        const img = document.createElement('img');
        img.src = imageData; // base64 directament
        img.className = 'card-img';
        img.alt = game.name;
        img.loading = 'lazy';
        
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            border-radius: 20px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        img.onload = () => {
            img.style.opacity = '1';
            container.innerHTML = '';
            container.appendChild(img);
        };
        
        img.onerror = () => {
            container.innerHTML = `
                <div class="img-fallback">
                    <i class="fa-solid fa-image"></i>
                    <span>${game.name}</span>
                </div>
            `;
        };
    } else {
        container.innerHTML = `
            <div class="img-fallback">
                <i class="fa-solid fa-gamepad"></i>
                <span>${game.name}</span>
            </div>
        `;
    }
},

    toggleFav(e, url, btn) {
        e.stopPropagation();
        const isNowFav = FavManager.toggle(url);
        const icon = btn.querySelector('i');
        if (isNowFav) {
            btn.classList.add('active');
            icon.classList.remove('fa-regular');
            icon.classList.add('fa-solid');
            
            // Actualizar la lista para que el favorito suba al principio
            if (typeof GAMES !== 'undefined' && this.grid) {
                const sortedGames = sortGamesByFavorites(GAMES);
                this.renderWithSkeleton(sortedGames);
            }
        } else {
            btn.classList.remove('active');
            icon.classList.remove('fa-solid');
            icon.classList.add('fa-regular');
            
            // Actualizar la lista para que deje de estar primero
            if (typeof GAMES !== 'undefined' && this.grid) {
                const sortedGames = sortGamesByFavorites(GAMES);
                this.renderWithSkeleton(sortedGames);
            }
        }
    },

    hover(e, el) {
        const glow = el.querySelector(".card-glow");
        if (glow) {
            const r = el.getBoundingClientRect();
            glow.style.left = (e.clientX - r.left) + "px";
            glow.style.top  = (e.clientY - r.top)  + "px";
        }
    },

    // FUNCIÓ LAUNCH SIMPLIFICADA - Minimalista
    launch(game) {
        this.activeGame = game;
        this.startTime = Date.now();
        
        // Crear iframe segur però funcional
        const iframe = this.createGameIframe(game);
        
        // Obtenir el contingut del modal
        const modalContent = this.modal.querySelector('.modal-content');
        if (!modalContent) {
            console.error('No es troba .modal-content');
            return;
        }
        
        // Netejar contingut previ
        modalContent.innerHTML = '';
        
        // Afegir només l'iframe i el botó de tancar
        modalContent.appendChild(iframe);
        
        // Botó de tancar minimalista amb estil liquid glass
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-liquid';
        closeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
        closeBtn.onclick = () => this.close();
        modalContent.appendChild(closeBtn);
        
        // Mostrar el modal
        this.modal.classList.add("active");
        document.body.style.overflow = "hidden";
    },

    // FUNCIÓ CLOSE
    close() {
        if (this.activeGame) {
            const seconds = Math.floor((Date.now() - this.startTime) / 1000);
            StatsSystem.recordSession(this.activeGame, seconds);
        }
        
        this.modal.classList.remove("active");
        document.body.style.overflow = "";
        this.activeGame = null;
    },

    // Crear iframe per al joc (amb proteccions bàsiques)
    createGameIframe(game) {
        const iframe = document.createElement('iframe');
        const gameUrl = `assets/games/${game.url}`;
        
        // Configuració bàsica de seguretat
        iframe.sandbox = SECURITY_CONFIG.SANDBOX_ATTRIBUTES;
        iframe.referrerpolicy = SECURITY_CONFIG.ADDITIONAL_ATTRIBUTES.referrerpolicy;
        iframe.allow = SECURITY_CONFIG.ADDITIONAL_ATTRIBUTES.allow;
        
        // Afegir atributs per a millor compatibilitat
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('scrolling', 'no');
        
        // Configurar src
        iframe.src = gameUrl;
        
        // Estils - ocupar tot l'espai
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: #000;
            display: block;
        `;
        
        // Gestió d'errors
        iframe.addEventListener('error', (e) => {
            console.error('Error carregant el joc:', game.name, e);
            this.showLoadError(game);
        });
        
        iframe.addEventListener('load', () => {
            console.log('Joc carregat:', game.name);
        });
        
        return iframe;
    },

    // Funció per mostrar error de càrrega
    showLoadError(game) {
        setTimeout(() => {
            const modalContent = this.modal.querySelector('.modal-content');
            if (!modalContent) return;
            
            const iframe = modalContent.querySelector('iframe');
            if (iframe) {
                const errorHTML = `
                    <div class="load-error">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <h3>Error carregant el joc</h3>
                        <p>No s'ha pogut carregar "${game.name}".</p>
                        <p>El joc podria requerir característiques no compatibles.</p>
                        <button onclick="GameCore.close()" class="btn-retry">Tancar</button>
                    </div>
                `;
                
                iframe.style.display = 'none';
                modalContent.insertAdjacentHTML('beforeend', errorHTML);
            }
        }, 2000);
    }
};

// Modificar clearImageCache para manejar ambos caches
async function clearImageCache() {
  let message = 'Vols esborrar tot el cache d\'imatges?';
  
  if (IS_ELECTRON && ELECTRON_CACHE) {
    message += '\n\nAixò inclourà el cache local (petit) i el cache d\'Electron (fins a 2GB).';
  }
  
  if (confirm(message)) {
    try {
      // Limpiar cache de Electron si está disponible
      if (IS_ELECTRON && ELECTRON_CACHE) {
        const success = await ELECTRON_CACHE.clearCache();
        if (success) {
          console.log('Cache d\'Electron netejat');
        }
      }
      
      // Limpiar cache local
      localStorage.removeItem('game_images_base64_cache');
      
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('img_timestamp_')) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      localStorage.removeItem('ula-first-load');
      
      console.log('Cache local netejat');
      
      // Mostrar notificación en Electron
      if (IS_ELECTRON) {
        showDesktopNotification('Cache Netejat', 'Tots els caches han estat esborrats.');
      }
      
      // Recargar
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (e) {
      console.error('Error netejant cache:', e);
      alert('Error netejant el cache: ' + e.message);
    }
  }
}

// Afegir opció de netejar cache al menú
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const dropdownMenu = document.querySelector('.dropdown-menu');
        if (dropdownMenu) {
            // Verificar si ya existe el enlace
            const existingLink = dropdownMenu.querySelector('a[onclick*="clearImageCache"]');
            if (!existingLink) {
                dropdownMenu.innerHTML += `
                    <a href="javascript:void(0)" onclick="clearImageCache()" class="menu-link">
                        <i class="fa-solid fa-trash"></i> Netejar Cache d'Imatges
                    </a>
                `;
            }
        }
    }, 1000);
});

// Afegir la funció a l'objecte global
window.clearImageCache = clearImageCache;

// Iniciar l'aplicació
window.addEventListener("load", () => {
    setTimeout(() => GameCore.init(), 50);
});

// Detectar si és un dispositiu mòbil
function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Millorar la interacció tàctil
document.addEventListener('DOMContentLoaded', function() {
    const touchElements = document.querySelectorAll('.kpi-card, .game-row, .btn-back');
    
    touchElements.forEach(element => {
        element.addEventListener('touchstart', function() {
            this.style.opacity = '0.8';
        });
        
        element.addEventListener('touchend', function() {
            this.style.opacity = '1';
        });
    });
    
    // Prevenir zoom en doble toc en elements interactius
    document.addEventListener('touchstart', function(event) {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });
    
    // Optimitzar per a mòbil si ho és
    if (isMobileDevice()) {
        document.body.classList.add('mobile-device');
        
        // Reduir animacions en mòbils antics
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery.matches) {
            document.documentElement.style.setProperty('--animation-speed', '0.1s');
        }
    }
});

// Theme Toggle Functionality - UPDATED
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Check for saved theme or preferred scheme
    const savedTheme = localStorage.getItem('ula-theme');
    const systemDark = prefersDark.matches;
    
    // Apply theme on load
    if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
        document.body.classList.add('dark-theme');
    }
    
    // Toggle theme on click
    themeToggle.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('ula-theme', isDark ? 'dark' : 'light');
        
        // Update aura color based on theme
        const aura = document.getElementById('cursorAura');
        if (aura) {
            if (isDark) {
                aura.style.setProperty('--aura-color', 'rgba(50, 215, 75, 0.08)');
            } else {
                aura.style.setProperty('--aura-color', 'rgba(0, 122, 255, 0.15)');
            }
        }
    });
    
    // Listen for system theme changes
    prefersDark.addEventListener('change', (e) => {
        // Only auto-switch if user hasn't manually set a preference
        if (!localStorage.getItem('ula-theme')) {
            if (e.matches) {
                document.body.classList.add('dark-theme');
            } else {
                document.body.classList.remove('dark-theme');
            }
        }
    });
}

/* ======================================================
   PREVENIR NETEJA EXCESSIVA DEL CACHE
====================================================== */

// Modificar la funció cleanupOldCacheIfNeeded per ser més conservadora
function cleanupOldCacheIfNeeded(newItemSizeKB = 100) {
    try {
        const currentSizeMB = getLocalStorageSize();
        const cacheData = localStorage.getItem('game_images_base64_cache');
        
        if (!cacheData) return;
        
        // Sols netejar si estem molt a prop del límit (90%)
        if (currentSizeMB + (newItemSizeKB / 1024) > MAX_CACHE_SIZE_MB * 0.9) {
            console.log(`Netejant cache d'imatges (${currentSizeMB.toFixed(2)}MB/${MAX_CACHE_SIZE_MB}MB)`);
            
            const parsed = JSON.parse(cacheData);
            const cacheEntries = Object.entries(parsed);
            
            // Ordenar per timestamp (més antigues primer)
            const cacheWithTimestamps = cacheEntries.map(([key, value]) => {
                const timestampKey = `img_timestamp_${key}`;
                const timestamp = parseInt(localStorage.getItem(timestampKey) || Date.now());
                return { key, value, timestamp };
            }).sort((a, b) => a.timestamp - b.timestamp);
            
            // Eliminar només les necessàries per estar al 70%
            const targetSizeMB = MAX_CACHE_SIZE_MB * 0.7;
            let removedCount = 0;
            
            while (currentSizeMB > targetSizeMB && cacheWithTimestamps.length > 0) {
                const oldest = cacheWithTimestamps.shift();
                delete parsed[oldest.key];
                localStorage.removeItem(`img_timestamp_${oldest.key}`);
                removedCount++;
            }
            
            if (removedCount > 0) {
                localStorage.setItem('game_images_base64_cache', JSON.stringify(parsed));
                console.log(`Eliminades ${removedCount} imatges antigues del cache`);
            }
        }
    } catch (e) {
        console.warn("Error netejant cache:", e);
    }
}

// Funció per verificar l'estat del cache
function checkImageCacheStatus() {
    const cacheData = localStorage.getItem('game_images_base64_cache');
    if (!cacheData) return { total: 0, cached: 0 };
    
    const parsed = JSON.parse(cacheData);
    const games = typeof GAMES !== 'undefined' ? GAMES : [];
    let cachedCount = 0;
    
    games.forEach(game => {
        const cacheKey = `img_${game.url}`;
        if (parsed[cacheKey]) cachedCount++;
    });
    
    return { 
        total: games.length, 
        cached: cachedCount,
        percentage: games.length > 0 ? (cachedCount / games.length * 100) : 0
    };
}

/* ======================================================
   FUNCIONES DE GESTIÓN DE ESTADO DE CARGA
====================================================== */

// Función para verificar estado del cache de imágenes
function checkImageCacheStatus() {
    try {
        const cacheData = localStorage.getItem('game_images_base64_cache');
        if (!cacheData) return { total: 0, cached: 0, percentage: 0 };
        
        const parsed = JSON.parse(cacheData);
        const games = typeof GAMES !== 'undefined' ? GAMES : [];
        let cachedCount = 0;
        
        games.forEach(game => {
            const cacheKey = `img_${game.url}`;
            if (parsed[cacheKey]) cachedCount++;
        });
        
        return { 
            total: games.length, 
            cached: cachedCount,
            percentage: games.length > 0 ? (cachedCount / games.length * 100) : 0
        };
    } catch (e) {
        console.warn("Error verificando estado del cache:", e);
        return { total: 0, cached: 0, percentage: 0 };
    }
}

// Modificar clearImageCache para resetear el estado del loader
function clearImageCache() {
    if (confirm('Vols esborrar tot el cache d\'imatges? Això farà que la propera vegada es tornin a descarregar totes les imatges.')) {
        try {
            // Eliminar cache de imágenes
            localStorage.removeItem('game_images_base64_cache');
            
            // Eliminar timestamps
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('img_timestamp_')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            // Resetear estado del loader para forzar recarga
            localStorage.removeItem('ulaGames_loader_state');
            
            console.log('Cache d\'imatges netejat completament');
            
            // Recargar la página
            window.location.reload();
            
        } catch (e) {
            console.error('Error netejant cache:', e);
        }
    }
}

// Modificar findGameImage para notificar al loader
const originalFindGameImage = findGameImage;

findGameImage = async function(gameUrl) {
    // Llamar a la función original
    const result = await originalFindGameImage(gameUrl);
    
    // Notificar al loader que una imagen se ha procesado
    if (window.incrementLoadedImage && typeof window.incrementLoadedImage === 'function') {
        window.incrementLoadedImage();
    }
    
    return result;
};

// Initialize theme toggle when DOM is loaded
document.addEventListener('DOMContentLoaded', initThemeToggle);

// Iniciar l'aplicació
window.addEventListener("load", () => {
    setTimeout(() => GameCore.init(), 100);
});

// AFEGEIX aquest codi al final de scripts.js, després de tot el contingut existent:

/* ======================================================
   PWA FUNCIONALITAT
====================================================== */

// Registrar Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('Service Worker registrat amb èxit:', registration.scope);
                    
                    // Comprovar actualitzacions periòdicament
                    setInterval(() => {
                        registration.update();
                    }, 60 * 60 * 1000); // Cada hora
                    
                    return registration;
                })
                .catch(error => {
                    console.error('Error registrant Service Worker:', error);
                });
        });
    }
}

// Instal·lar PWA
function installPWA() {
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevenir que el navegador mostri la pregunta automàtica
        e.preventDefault();
        deferredPrompt = e;
        
        // Mostrar botó d'instal·lació personalitzat
        showInstallButton();
    });
    
    function showInstallButton() {
        // Crear botó d'instal·lació si no existeix
        if (!document.getElementById('installButton')) {
            const installBtn = document.createElement('button');
            installBtn.id = 'installButton';
            installBtn.className = 'install-pwa-btn';
            installBtn.innerHTML = '<i class="fa-solid fa-download"></i> Instal·lar App';
            installBtn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: var(--accent);
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 50px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(0, 122, 255, 0.3);
                z-index: 9998;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: transform 0.3s ease;
            `;
            
            installBtn.addEventListener('click', () => {
                installBtn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    installBtn.style.transform = 'scale(1)';
                }, 200);
                
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('PWA instal·lada');
                        installBtn.style.display = 'none';
                    }
                    deferredPrompt = null;
                });
            });
            
            document.body.appendChild(installBtn);
            
            // Amagar automàticament després de 10 segons
            setTimeout(() => {
                if (installBtn && installBtn.parentNode) {
                    installBtn.style.opacity = '0';
                    installBtn.style.transform = 'translateY(20px)';
                    setTimeout(() => {
                        if (installBtn && installBtn.parentNode) {
                            installBtn.parentNode.removeChild(installBtn);
                        }
                    }, 300);
                }
            }, 10000);
        }
    }
    
    // Amagar botó quan la PWA ja estigui instal·lada
    window.addEventListener('appinstalled', () => {
        console.log('PWA instal·lada');
        const installBtn = document.getElementById('installButton');
        if (installBtn) {
            installBtn.parentNode.removeChild(installBtn);
        }
    });
}

// Comprovar mode standalone
function checkPWAStatus() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.body.classList.add('pwa-standalone');
        console.log('Executant en mode PWA');
    }
}

// Notificacions push (demana permís)
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        // Demanar permís després d'uns segons d'ús
        setTimeout(() => {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Permís de notificacions concedit');
                    // Aquí podries subscriure't a push notifications
                }
            });
        }, 30000); // Demanar després de 30 segons
    }
}

// Funcions de cache
function clearAllCache() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            registration.active.postMessage({ type: 'CLEAR_CACHE' });
        });
    }
    
    // Netejar localStorage també (opcional)
    localStorage.clear();
    alert('Cache netejat. La pàgina es recarregarà.');
    setTimeout(() => {
        window.location.reload();
    }, 1000);
}

// Función para obtener estadísticas del cache
async function getCacheStatistics() {
  const stats = {
    local: {
      size: (JSON.stringify(localStorage).length / 1024).toFixed(2) + ' KB',
      items: localStorage.length
    },
    electron: null
  };
  
  if (IS_ELECTRON && ELECTRON_CACHE) {
    try {
      const electronStats = await ELECTRON_CACHE.getStats();
      stats.electron = electronStats;
    } catch (error) {
      console.warn('Error obtenint estadístiques d\'Electron:', error);
    }
  }
  
  return stats;
}

// Añadir opción de estadísticas al menú
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const dropdownMenu = document.querySelector('.dropdown-menu');
    if (dropdownMenu) {
      // Verificar si ya existe
      const existingLink = dropdownMenu.querySelector('a[onclick*="getCacheStatistics"]');
      if (!existingLink) {
        dropdownMenu.innerHTML += `
          <a href="javascript:void(0)" onclick="showCacheStatistics()" class="menu-link">
            <i class="fa-solid fa-chart-pie"></i> Estadístiques del Cache
          </a>
          ${IS_ELECTRON ? `
          <a href="javascript:void(0)" onclick="openCacheFolder()" class="menu-link">
            <i class="fa-solid fa-folder-open"></i> Obrir Carpeta del Cache
          </a>
          ` : ''}
        `;
      }
    }
  }, 1000);
});

// Mostrar estadísticas del cache
async function showCacheStatistics() {
  const stats = await getCacheStatistics();
  
  let message = `Cache Local:\n`;
  message += `  Items: ${stats.local.items}\n`;
  message += `  Mida: ${stats.local.size}\n\n`;
  
  if (stats.electron) {
    message += `Cache d'Electron:\n`;
    if (stats.electron.system) {
      message += `  Items: ${stats.electron.system.totalItems}\n`;
      message += `  Mida: ${stats.electron.system.totalSizeMB}MB / ${stats.electron.system.maxSizeMB}MB\n`;
      message += `  Ús: ${stats.electron.system.usagePercentage}%\n`;
    }
    if (stats.electron.runtime) {
      message += `  Accesos: ${stats.electron.runtime.hits} hits, ${stats.electron.runtime.misses} misses\n`;
      message += `  Guardats: ${stats.electron.runtime.saves}\n`;
    }
  }
  
  alert(message);
}

// Abrir carpeta del cache en Electron
function openCacheFolder() {
  if (IS_ELECTRON && window.electronAPI) {
    window.electronAPI.getCachePath().then(path => {
      window.electronAPI.openPath(path);
    });
  }
}

function getCacheStatus() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            const channel = new MessageChannel();
            registration.active.postMessage({ type: 'GET_CACHE_STATUS' }, [channel.port2]);
            
            channel.port1.onmessage = (event) => {
                console.log('Estat del cache:', event.data);
                alert(`Cache: ${event.data.cacheCount} caches, ${event.data.totalItems} recursos emmagatzemats`);
            };
        });
    }
}

// Inicialitzar PWA
function initPWA() {
    registerServiceWorker();
    installPWA();
    checkPWAStatus();
    requestNotificationPermission();
    
    // Afegir opcions de cache al menú
    setTimeout(() => {
        const dropdownMenu = document.querySelector('.dropdown-menu');
        if (dropdownMenu) {
            dropdownMenu.innerHTML += `
                <a href="javascript:void(0)" onclick="clearAllCache()" class="menu-link">
                    <i class="fa-solid fa-broom"></i> Netejar tot el Cache
                </a>
                <a href="javascript:void(0)" onclick="getCacheStatus()" class="menu-link">
                    <i class="fa-solid fa-database"></i> Estat del Cache
                </a>
                <a href="javascript:void(0)" onclick="if('serviceWorker' in navigator) { navigator.serviceWorker.ready.then(reg => reg.update()); alert('Actualitzant...'); }" class="menu-link">
                    <i class="fa-solid fa-rotate"></i> Actualitzar App
                </a>
            `;
        }
    }, 1000);
}

// Executar quan la pàgina carregui
document.addEventListener('DOMContentLoaded', initPWA);

// Mode offline
window.addEventListener('online', () => {
    console.log('Torneu a estar en línia');
    // Podries mostrar una notificació
});

window.addEventListener('offline', () => {
    console.log('Heu perdut la connexió');
    // Podries mostrar una alerta
});

/* ======================================================
   PERFORMANCE MODE TOGGLE
====================================================== */

const PERFORMANCE_MODE_KEY = "ula-performance-mode";

function initPerformanceMode() {
    // Check if performance mode is enabled
    const isPerformanceMode = localStorage.getItem(PERFORMANCE_MODE_KEY) === 'true';
    
    if (isPerformanceMode) {
        document.body.classList.add('performance-mode');
        updatePerformanceModeText(true);
    } else {
        updatePerformanceModeText(false);
    }
    
    // Add performance indicator
    const indicator = document.createElement('div');
    indicator.className = 'performance-indicator';
    indicator.innerHTML = '<i class="fa-solid fa-bolt"></i> RENDIMENT';
    document.body.appendChild(indicator);
}

function togglePerformanceMode() {
    const isCurrentlyOn = document.body.classList.contains('performance-mode');
    
    if (isCurrentlyOn) {
        // Turn off performance mode
        document.body.classList.remove('performance-mode');
        localStorage.setItem(PERFORMANCE_MODE_KEY, 'false');
        updatePerformanceModeText(false);
        
        // Re-enable animations
        document.querySelectorAll('*').forEach(el => {
            if (el.style.animationDuration === '0.01ms') {
                el.style.animationDuration = '';
            }
            if (el.style.transitionDuration === '0.01ms') {
                el.style.transitionDuration = '';
            }
        });
        
        showNotification('Mode rendiment DESACTIVAT', 'info');
    } else {
        // Turn on performance mode
        document.body.classList.add('performance-mode');
        localStorage.setItem(PERFORMANCE_MODE_KEY, 'true');
        updatePerformanceModeText(true);
        
        // Apply performance optimizations
        optimizeForPerformance();
        
        showNotification('Mode rendiment ACTIVAT', 'success');
    }
    
    // Force reflow to ensure changes apply
    document.body.offsetHeight;
}

function updatePerformanceModeText(isOn) {
    const textElement = document.getElementById('performanceModeText');
    if (textElement) {
        textElement.textContent = `Mode Rendiment: ${isOn ? 'ON' : 'OFF'}`;
    }
    
    // Update the icon in the menu as well
    const menuLinks = document.querySelectorAll('.menu-link');
    menuLinks.forEach(link => {
        if (link.querySelector('#performanceModeText')) {
            const icon = link.querySelector('i');
            if (icon) {
                icon.className = isOn ? 'fa-solid fa-gauge-high-bolt' : 'fa-solid fa-gauge-high';
            }
        }
    });
}

function optimizeForPerformance() {
    // Reduce JavaScript timers
    if (window.GameCore && window.GameCore.renderWithSkeleton) {
        // Cache the original function
        if (!window.GameCore.originalRenderWithSkeleton) {
            window.GameCore.originalRenderWithSkeleton = window.GameCore.renderWithSkeleton;
        }
        
        // Override with optimized version
        window.GameCore.renderWithSkeleton = function(list) {
            if (!this.grid) return;
            
            this.grid.innerHTML = "";
            this.grid.classList.remove('skeleton-grid');
            
            if (!list || list.length === 0) {
                this.grid.innerHTML = `<div class="no-games"><h3>No s'han trobat jocs</h3></div>`;
                return;
            }
            
            const fragment = document.createDocumentFragment();
            
            list.forEach(game => {
                const color = getGameColor(game);
                const isFav = FavManager.isFav(game.url);
                
                const card = document.createElement("div");
                card.className = "card";
                card.setAttribute('data-game-url', game.url);
                
                card.innerHTML = `
                    <div class="card-preview">
                        <div class="card-fav ${isFav ? 'active' : ''}" onclick="GameCore.toggleFav(event, '${game.url}', this)">
                            <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                        </div>
                        <div class="img-fallback">
                            <i class="fa-solid fa-gamepad"></i>
                            <span>${game.name}</span>
                        </div>
                    </div>
                    <div class="card-info">
                        <div class="card-title">${game.name}</div>
                    </div>
                `;
                
                card.onclick = (e) => {
                    if(!e.target.closest('.card-fav')) this.launch(game);
                };
                
                fragment.appendChild(card);
            });
            
            this.grid.appendChild(fragment);
        };
    }
    
    // Reduce image quality requests
    if (window.findGameImage) {
        const originalFindGameImage = window.findGameImage;
        window.findGameImage = async function(gameUrl) {
            // Skip image cache in performance mode, use fallback
            return null;
        };
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `performance-notification ${type}`;
    notification.innerHTML = `
        <i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? 'rgba(50, 215, 75, 0.9)' : 'rgba(0, 122, 255, 0.9)'};
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 9999;
        backdrop-filter: blur(10px);
        animation: slideInRight 0.3s ease;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    `;
    
    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Initialize performance mode on load
document.addEventListener('DOMContentLoaded', initPerformanceMode);

// Restore normal mode functions when leaving performance mode
function restoreNormalMode() {
    if (window.GameCore && window.GameCore.originalRenderWithSkeleton) {
        window.GameCore.renderWithSkeleton = window.GameCore.originalRenderWithSkeleton;
        delete window.GameCore.originalRenderWithSkeleton;
    }
    
    if (window.originalFindGameImage) {
        window.findGameImage = window.originalFindGameImage;
        delete window.originalFindGameImage;
    }
}

// Call this when toggling performance mode OFF
function togglePerformanceMode() {
    const isCurrentlyOn = document.body.classList.contains('performance-mode');
    
    if (isCurrentlyOn) {
        // Turn off performance mode
        document.body.classList.remove('performance-mode');
        localStorage.setItem(PERFORMANCE_MODE_KEY, 'false');
        updatePerformanceModeText(false);
        
        // Restore normal functions
        restoreNormalMode();
        
        showNotification('Mode rendiment DESACTIVAT', 'info');
    } else {
        // Turn on performance mode
        document.body.classList.add('performance-mode');
        localStorage.setItem(PERFORMANCE_MODE_KEY, 'true');
        updatePerformanceModeText(true);
        
        // Apply performance optimizations
        optimizeForPerformance();
        
        showNotification('Mode rendiment ACTIVAT', 'success');
    }
    
    // Force reflow to ensure changes apply
    document.body.offsetHeight;
}

// Inicializar al cargar
if (IS_ELECTRON) {
  console.log('ulaGames Desktop - Mode Electron activat');
  
  // Configurar listeners de eventos de Electron
  if (window.electronAPI) {
    window.electronAPI.onCacheCleared(() => {
      showDesktopNotification('Cache Netejat', 'El cache ha estat esborrat completament.');
    });
    
    window.electronAPI.onTogglePerformanceMode((event, enabled) => {
      const isCurrentlyOn = document.body.classList.contains('performance-mode');
      if (enabled !== isCurrentlyOn) {
        togglePerformanceMode();
      }
    });
  }
}