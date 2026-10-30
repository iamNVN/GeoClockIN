import { CircleCheck, Download, FileSpreadsheet, LoaderCircle, TriangleAlert, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { download, upload } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';

/**
 * Excel import: pick or drop a .xlsx, upload it, show row-level errors or a
 * summary. `describe(result)` turns the server response into a sentence.
 */
export function ImportDialog({ open, onClose, title, intro, templatePath, importPath, describe, onImported }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState({ name: 'idle' });

  const reset = () => {
    setFile(null);
    setState({ name: 'idle' });
  };
  const close = () => {
    reset();
    onClose();
  };

  function choose(selected) {
    if (!selected) return;
    if (!/\.xlsx$/i.test(selected.name)) {
      setState({ name: 'error', message: 'Choose an Excel workbook (.xlsx).' });
      return;
    }
    setFile(selected);
    setState({ name: 'idle' });
  }

  async function submit() {
    setState({ name: 'uploading' });
    try {
      const result = await upload(importPath, file);
      setState({ name: 'done', message: describe(result) });
      onImported?.(result);
    } catch (error) {
      setState({ name: 'error', message: error.message, errors: error.data?.errors ?? [] });
    }
  }

  const footer =
    state.name === 'done' ? (
      <button type="button" className="btn btn--primary" onClick={close}>
        Done
      </button>
    ) : (
      <>
        <button type="button" className="btn btn--secondary" onClick={close}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={!file || state.name === 'uploading'}>
          {state.name === 'uploading' ? <LoaderCircle className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          Import
        </button>
      </>
    );

  return (
    <Modal open={open} title={title} subtitle={intro} onClose={close} footer={footer}>
      {state.name === 'done' ? (
        <div className="import-result">
          <CircleCheck aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="link-btn"
            onClick={() => download(templatePath).catch((e) => toast.error(e.message))}
          >
            <Download aria-hidden="true" /> Download the template
          </button>

          <div
            className={`dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
          >
            <FileSpreadsheet aria-hidden="true" />
            {file ? (
              <p>
                <strong>{file.name}</strong> · {(file.size / 1024).toFixed(0)} KB
              </p>
            ) : (
              <p>Drag an Excel file here, or</p>
            )}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => inputRef.current.click()}>
              {file ? 'Choose another file' : 'Browse files'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                choose(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </div>

          {state.name === 'error' && (
            <div className="notice notice--error" role="alert">
              <TriangleAlert aria-hidden="true" />
              <div>
                <p>{state.message}</p>
                {state.errors?.length > 0 && (
                  <ul className="import-errors">
                    {state.errors.slice(0, 50).map((err, i) => (
                      <li key={i}>
                        {err.row ? <strong>Row {err.row}:</strong> : null} {err.message}
                      </li>
                    ))}
                    {state.errors.length > 50 && <li>…and {state.errors.length - 50} more.</li>}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
