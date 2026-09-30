'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { cardSchema, fieldLabels, generatedSchema, identitySchema, infoSchema, nameInput, photoSchema, type FlowerCard, type FlowerInfo, type Identity, type Photo } from '@/lib/schemas';
import { loadCards, STORAGE_KEY, storeCards, markDeleted, deletedIds } from '@/lib/storage';
import { backupRequest, restoreBackup } from '@/lib/backup-client';
const fields = Object.keys(fieldLabels) as (keyof FlowerInfo)[];
async function api(path: string, body: unknown) {
  let response: Response;
  try { response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(path === '/api/search' ? 190000 : 65000) }); }
  catch { throw new Error('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Der Server hat eine ungültige Antwort geliefert. Bitte versuche es erneut.'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.');
  return data;
}
function Attribution({ photo }: { photo: Pick<FlowerCard, 'imageAuthor' | 'imageAuthorUrl' | 'imagePageUrl' | 'imageSource' | 'imageLicense' | 'imageLicenseUrl'> }) {
  return <small className="attribution">Foto: {photo.imageAuthorUrl ? <a href={photo.imageAuthorUrl} target="_blank" rel="noopener noreferrer">{photo.imageAuthor}</a> : photo.imageAuthor} auf <a href={photo.imagePageUrl || (photo.imageSource === 'Pixabay' ? 'https://pixabay.com' : photo.imageSource === 'Wikimedia' ? 'https://commons.wikimedia.org' : 'https://www.pexels.com')} target="_blank" rel="noopener noreferrer">{photo.imageSource} ↗</a>{photo.imageLicense && <> · {photo.imageLicenseUrl ? <a href={photo.imageLicenseUrl} target="_blank" rel="noopener noreferrer">{photo.imageLicense}</a> : photo.imageLicense}</>}</small>;
}
function FlowerImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? <div className="image-fallback">Foto nicht verfügbar</div> : <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
function FlipCard({ card }: { card: FlowerCard }) {
  const [back, setBack] = useState(false);
  return <div className="card-wrap"><button type="button" className={`flip-card ${back ? 'is-flipped' : ''}`} onClick={() => setBack(!back)} aria-label={`${card.germanName}: ${back ? 'Vorderseite' : 'Rückseite'} anzeigen`} aria-pressed={back}>
    <span className="flip-inner"><span className="card-face card-front" aria-hidden={back}><FlowerImage src={card.imageUrl} alt={card.germanName} /><span className="card-title"><strong>{card.germanName}</strong><span>Rückseite ansehen ↻</span></span></span>
    <span className="card-face card-back" aria-hidden={!back}>{fields.map(key => <span className="card-field" key={key}><strong>{fieldLabels[key]}</strong><span>{card[key]}</span></span>)}</span></span>
  </button><Attribution photo={card} /></div>;
}
export default function Home() {
  const [cards, setCards] = useState<FlowerCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<(Omit<Photo, 'imageUrl' | 'imageSource' | 'imageAuthorUrl' | 'imagePageUrl'> & Pick<FlowerCard, 'imageUrl' | 'imageSource' | 'imageAuthorUrl' | 'imagePageUrl'>) | null>(null);
  const [info, setInfo] = useState<FlowerInfo | null>(null);
  const [suggestion, setSuggestion] = useState<FlowerInfo | null>(null);
  const [editing, setEditing] = useState<FlowerCard | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [backupWarning, setBackupWarning] = useState('');
  const [storageError, setStorageError] = useState('');
  const [deleting, setDeleting] = useState<FlowerCard | null>(null);
  useEffect(() => {
    try { setCards(loadCards()); setStorageOk(true); void restoreBackup(setCards).catch(() => setBackupWarning('Die Datenbanksicherung ist gerade nicht erreichbar. Deine lokalen Karten bleiben verfügbar.')); }
    catch { setStorageError('Die gespeicherten Karten können nicht gelesen werden. Bitte prüfe die Browser-Einstellungen. Vorhandene Daten werden nicht überschrieben.'); }
    setLoaded(true);
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) { try { setCards(loadCards()); setStorageOk(true); setStorageError(''); } catch { setStorageOk(false); setStorageError('Die gespeicherten Daten sind ungültig. Bitte prüfe den Browserspeicher.'); } } };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  function reset() { setName(''); setIdentity(null); setPhotos([]); setSelected(null); setInfo(null); setSuggestion(null); setEditing(null); setError(''); setNotice(''); }
  function newCard() { reset(); setOpen(true); }
  async function search(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    const parsed = nameInput.safeParse(name);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy('Blume und Fotos werden gesucht …'); setIdentity(null); setSelected(null); setInfo(null); setSuggestion(null); setPhotos([]);
    try {
      const result = z.object({ identity: identitySchema, photos: z.array(photoSchema), usedQuery: z.string(), warning: z.string().optional() }).parse(await api('/api/search', { name: parsed.data }));
      setIdentity(result.identity); setPhotos(result.photos); if (result.warning) setNotice(result.warning);
      if (!result.photos.length) setNotice('Für diese Blume wurden keine Fotos gefunden. Versuche einen anderen oder genaueren Blumennamen.');
    } catch (err) { setError(err instanceof z.ZodError ? 'Die Suchergebnisse sind ungültig. Bitte versuche es erneut.' : (err as Error).message); }
    finally { setBusy(''); }
  }
  async function generate() {
    if (!identity || !selected) return;
    setBusy('Informationen werden erstellt …'); setError(''); setNotice('');
    try { const result = generatedSchema.parse(await api('/api/card', { action: 'generate', identity })); setInfo(infoSchema.parse(result)); }
    catch (err) { setError(err instanceof z.ZodError ? 'Die Informationen sind unvollständig. Bitte versuche es erneut.' : (err as Error).message); }
    finally { setBusy(''); }
  }
  async function verify() {
    if (!identity || !info) return;
    const parsed = infoSchema.safeParse(info); if (!parsed.success) { setError('Bitte fülle alle vier Felder aus und beachte die maximale Länge.'); return; }
    setBusy('Informationen werden geprüft …'); setError(''); setNotice(''); setSuggestion(null);
    try {
      const checked = infoSchema.parse(generatedSchema.parse(await api('/api/card', { action: 'verify', identity, info: parsed.data })));
      if (fields.some(key => checked[key] !== parsed.data[key])) setSuggestion(checked);
      else setNotice('Gemini hat keine Änderungen vorgeschlagen. Die Angaben bleiben bearbeitbar.');
    } catch (err) { setError(err instanceof z.ZodError ? 'Die Prüfung hat ungültige Daten geliefert. Bitte versuche es erneut.' : (err as Error).message); }
    finally { setBusy(''); }
  }
  function persist(next: FlowerCard[]): boolean {
    try {
     
      storeCards(next); setCards(next); setStorageError(''); return true;
    } catch { setStorageError('Speichern ist nicht möglich. Der Browserspeicher ist voll oder gesperrt. Deine Eingaben bleiben erhalten.'); return false; }
  }
  async function save() {
    if (!identity || !selected || !info || !storageOk) return;
    const parsed = cardSchema.safeParse({ ...identity, ...info, id: editing?.id || crypto.randomUUID(), imageUrl: selected.imageUrl, imageSource: selected.imageSource, imageOriginalUrl: editing?.imageOriginalUrl || (selected.imageUrl.startsWith('https://') ? selected.imageUrl : undefined), imageAuthor: selected.imageAuthor, imageAuthorUrl: selected.imageAuthorUrl, imagePageUrl: selected.imagePageUrl, imageLicense: selected.imageLicense, imageLicenseUrl: selected.imageLicenseUrl, updatedAt: new Date().toISOString(), createdAt: editing?.createdAt || new Date().toISOString() });
    if (!parsed.success) { setError('Bitte fülle alle vier Felder aus und beachte die maximale Länge.'); return; }
    setBusy('Karte wird gespeichert …'); setError('');
    try {
      const current = loadCards(); const next = editing ? current.map(card => card.id === editing.id ? parsed.data : card) : [parsed.data, ...current];
      if (editing && !current.some(card => card.id === editing.id)) { setError('Diese Karte wurde in einem anderen Fenster gelöscht. Bitte erstelle eine neue Karte.'); return; }
      if (persist(next)) {
        const saved = parsed.data;
        reset(); setOpen(false); setNotice('Karte gespeichert.');
        // The card is already local. Image caching and database backup cannot block saving.
        void (async () => {
          if (saved.imageSource === 'Pixabay' && saved.imageUrl.startsWith('https://')) {
            try {
              const downloaded = await api('/api/images', { imageUrl: saved.imageUrl });
              const latest = loadCards();
              if (latest.some(card => card.id === saved.id && card.updatedAt === saved.updatedAt)) {
                saved.imageUrl = cardSchema.shape.imageUrl.parse(downloaded.imageUrl);
                storeCards(latest.map(card => card.id === saved.id ? saved : card)); setCards(loadCards());
              }
            } catch { setBackupWarning('Karte lokal gespeichert. Die lokale Fotokopie konnte nicht erstellt werden.'); }
          }
          if (!deletedIds().includes(saved.id)) await backupRequest({ action: 'save', card: saved });
        })().catch(() => setBackupWarning('Karte lokal gespeichert. Die Datenbanksicherung ist gerade nicht erreichbar.'));
      }
    }
    catch (err) { setError(err instanceof z.ZodError ? 'Die gespeicherten Daten sind ungültig. Bitte prüfe den Browserspeicher.' : err instanceof Error ? err.message : 'Die Karte konnte nicht gespeichert werden.'); } finally { setBusy(''); }
  }
  function edit(card: FlowerCard) { reset(); setEditing(card); setIdentity(identitySchema.parse(card)); setName(card.germanName); setSelected({ id: 0, imageUrl: card.imageUrl, thumbnailUrl: card.imageUrl, imageSource: card.imageSource, imageAuthor: card.imageAuthor, imageAuthorUrl: card.imageAuthorUrl, imagePageUrl: card.imagePageUrl, imageLicense: card.imageLicense, imageLicenseUrl: card.imageLicenseUrl, alt: card.germanName }); setInfo(infoSchema.parse(card)); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function remove() { if (!deleting || !storageOk) return; try { const id = deleting.id; if (persist(loadCards().filter(card => card.id !== id))) { markDeleted(id); void backupRequest({ action: 'delete', id }).catch(() => setBackupWarning('Karte lokal gelöscht. Die Löschung der Sicherung wird beim nächsten Besuch erneut versucht.')); setDeleting(null); setNotice('Karte gelöscht.'); } } catch { setStorageError('Die gespeicherten Karten können nicht gelesen werden.'); } }
  const preview = identity && selected && info ? { ...identity, ...info, id: 'preview', imageUrl: selected.imageUrl, imageSource: selected.imageSource, imageOriginalUrl: editing?.imageOriginalUrl || (selected.imageUrl.startsWith('https://') ? selected.imageUrl : undefined), imageAuthor: selected.imageAuthor, imageAuthorUrl: selected.imageAuthorUrl, imagePageUrl: selected.imagePageUrl, imageLicense: selected.imageLicense, imageLicenseUrl: selected.imageLicenseUrl, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() } : null;
  return <main>
    <header className="topbar"><a className="brand" href="/" aria-label="Blumenkarten Startseite"><span className="brand-icon">✳</span> Blumenkarten</a><span className="topbar-note">Dein kleines Floristik-Lexikon</span></header>
    <div className="page-heading"><div><p className="eyebrow">SAMMLUNG & WISSEN</p><h1>Blumen. Kurz & klar.</h1><p className="subtitle">Ein Foto, vier Fakten. Deine Blumenkenntnisse auf einer Karte.</p></div><button className="primary" onClick={newCard} disabled={!loaded || !!busy || open}>＋ Neue Karte</button></div>
    {backupWarning && <small role="status" className="backup-warning">{backupWarning}</small>}
    {storageError && <div role="alert" className="alert error">{storageError}</div>}
    {error && <div role="alert" className="alert error">{error}</div>}
    {notice && <div role="status" className="alert success">{notice}</div>}
    {open && <section className="editor" aria-label="Karte erstellen"><div className="section-heading"><div><p className="eyebrow">{editing ? 'KARTE BEARBEITEN' : 'NEUE KARTE'}</p><h2>{info ? 'Informationen & Vorschau' : 'Welche Blume darf es sein?'}</h2></div><button className="quiet" disabled={!!busy} onClick={() => { if ((info || selected) && !window.confirm('Entwurf verwerfen und zurück zur Sammlung?')) return; reset(); setOpen(false); }}>Zurück</button></div>
      {!info && <><form onSubmit={search} className="search-form"><label htmlFor="flower-name">Blumenname<input id="flower-name" placeholder="z. B. Strandflieder" value={name} onChange={event => setName(event.target.value)} maxLength={100} disabled={!!busy} autoFocus required /></label><button className="primary" disabled={!!busy} type="submit">Suchen</button></form><p className="hint">Gib den deutschen Namen ein. Wir suchen mit dem englischen und bei Bedarf dem botanischen Namen.</p></>}
      {identity && <div className="identity"><strong>{identity.germanName}</strong><span>{identity.englishName}{identity.latinName && ` · ${identity.latinName}`}</span></div>}
      {!!photos.length && !info && <><div className="photo-heading"><h3>Wähle ein passendes Foto</h3><span className="hint">Pixabay / Wikimedia Commons</span></div><p className="hint">Bitte prüfe selbst, ob das Foto die richtige Blume zeigt.</p><div className="photo-grid">{photos.map(photo => <div key={`${photo.imageSource}:${photo.id}`}><button className={`photo-option ${selected?.id === photo.id && selected?.imageSource === photo.imageSource ? 'selected' : ''}`} aria-label={`Foto von ${photo.imageAuthor} auswählen`} aria-pressed={selected?.id === photo.id && selected?.imageSource === photo.imageSource} disabled={!!busy} onClick={() => setSelected(photo)}><FlowerImage src={photo.thumbnailUrl} alt={photo.alt || identity?.germanName || 'Blume'} />{selected?.id === photo.id && selected?.imageSource === photo.imageSource && <span className="selection-mark">✓ Ausgewählt</span>}</button><Attribution photo={photo} /></div>)}</div><div className="actions"><span className="hint">{selected ? 'Foto ausgewählt. Weiter zu den Informationen.' : 'Wähle ein Foto, um fortzufahren.'}</span><button className="primary" onClick={generate} disabled={!selected || !!busy}>Karte erstellen</button></div></>}
      {info && preview && <div className="edit-layout"><div><div className="edit-fields">{fields.map(key => <label key={key} htmlFor={key}>{fieldLabels[key]}<textarea id={key} aria-label={fieldLabels[key]} value={info[key]} rows={key === 'verarbeitung' ? 4 : 3} maxLength={key === 'verarbeitung' ? 1000 : 600} disabled={!!busy} onChange={event => { setInfo({ ...info, [key]: event.target.value }); setSuggestion(null); setNotice(''); }} /></label>)}</div><p className="hint">KI-generierte Angaben. Du kannst alle Felder bearbeiten. Eine zusätzliche KI-Prüfung ist optional.</p><div className="actions"><button onClick={verify} disabled={!!busy}>Informationen prüfen</button><button className="primary" onClick={save} disabled={!!busy || !storageOk}>Speichern</button></div></div><aside className="preview"><p className="eyebrow">KARTENVORSCHAU</p><FlipCard card={preview} /><p className="hint">Klicke auf die Karte, um sie umzudrehen.</p></aside></div>}
      {suggestion && info && <section className="verification"><h3>Vorschlag nach der Prüfung</h3><p className="hint">Vergleiche die Änderungen und entscheide, ob du sie übernehmen möchtest.</p>{fields.filter(key => suggestion[key] !== info[key]).map(key => <div key={key} className="comparison"><strong>{fieldLabels[key]}</strong><div><span>Bisher</span><p>{info[key]}</p></div><div><span>Vorschlag</span><p>{suggestion[key]}</p></div></div>)}<div className="actions"><button onClick={() => setSuggestion(null)}>Bisherige Angaben behalten</button><button className="primary" onClick={() => { setInfo(suggestion); setSuggestion(null); setNotice('Vorschlag übernommen. Du kannst die Angaben weiter bearbeiten.'); }}>Änderungen übernehmen</button></div></section>}
      {busy && <p role="status" className="loading"><span className="spinner" />{busy}</p>}
    </section>}
    <section className="library" aria-label="Gespeicherte Karten"><div className="library-heading"><h2>Deine Sammlung <span className="count">{cards.length}</span></h2><span className="hint">In diesem Browser gespeichert</span></div>
      {!loaded ? <p role="status">Sammlung wird geladen …</p> : cards.length ? <div className="library-grid">{cards.map(card => <article key={card.id}><FlipCard card={card} /><div className="card-actions"><button className="quiet" onClick={() => edit(card)} disabled={open || !!busy}>Bearbeiten</button><button className="quiet danger" onClick={() => setDeleting(card)} disabled={!storageOk || !!busy}>Löschen</button></div></article>)}</div> : <div className="empty-state"><span className="empty-icon">✳</span><h3>Platz für deine erste Blume.</h3><p>Erstelle eine Karte und baue Schritt für Schritt<br />dein eigenes Floristik-Lexikon auf.</p><button onClick={newCard} disabled={!loaded || open || !!busy}>＋ Erste Karte erstellen</button></div>}
    </section><footer>Blumenkarten <span>Wissen sammeln. Blumen verstehen.</span></footer>
    {deleting && <div className="modal-backdrop"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" onKeyDown={event => { if (event.key === 'Escape') setDeleting(null); if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } }}><h2 id="delete-title">Karte löschen?</h2><p>„{deleting.germanName}“ wird aus deiner Sammlung entfernt.</p><div className="actions"><button autoFocus onClick={() => setDeleting(null)}>Abbrechen</button><button className="delete-button" onClick={remove}>Löschen</button></div></section></div>}
  </main>;
}
