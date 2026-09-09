"use client";

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const initialForm = {
	id: null,
	name: '',
	description: '',
	storeIds: [],
};

function toPositiveId(value) {
	const id = String(value ?? '').trim();
	return /^\d+$/.test(id) && id !== '0' ? id : null;
}

function parseApiRecords(json) {
	if (Array.isArray(json?.data?.records)) return json.data.records;
	if (Array.isArray(json?.data?.stores)) return json.data.stores;
	if (Array.isArray(json)) return json;
	return [];
}

export default function RegionsPage() {
	const [regions, setRegions] = useState([]);
	const [stores, setStores] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [search, setSearch] = useState('');
	const [storeSearch, setStoreSearch] = useState('');
	const [showForm, setShowForm] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;

		async function loadData() {
			setLoading(true);
			try {
				const [regionRes, storesRes] = await Promise.all([
					fetch('/api/regions', { cache: 'no-store', credentials: 'include' }),
					fetch('/api/stores', { cache: 'no-store', credentials: 'include' }),
				]);

				const regionJson = await regionRes.json().catch(() => ({}));
				const storesJson = await storesRes.json().catch(() => ({}));
				if (cancelled) return;

				setRegions(parseApiRecords(regionJson));
				setStores(parseApiRecords(storesJson));
			} catch (err) {
				if (!cancelled) {
					console.error('[regions page] load error', err);
					setRegions([]);
					setStores([]);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		loadData();
		return () => {
			cancelled = true;
		};
	}, []);

	const filteredRegions = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return regions;

		return regions.filter((region) => {
			const hay = [region.name, region.description, String(region.storeCount || 0)].join(' ').toLowerCase();
			return hay.includes(query);
		});
	}, [regions, search]);

	const filteredStores = useMemo(() => {
		const query = storeSearch.trim().toLowerCase();
		if (!query) return stores;

		return stores.filter((store) => {
			const hay = [store.name, String(store.id)].join(' ').toLowerCase();
			return hay.includes(query);
		});
	}, [stores, storeSearch]);

	const openCreate = () => {
		setForm(initialForm);
		setError('');
		setStoreSearch('');
		setShowForm(true);
	};

	const openEdit = (region) => {
		setForm({
			id: toPositiveId(region.id),
			name: String(region.name || ''),
			description: String(region.description || ''),
			storeIds: Array.isArray(region.storeIds)
				? region.storeIds.map(String)
				: Array.isArray(region.stores)
					? region.stores.map((s) => String(s.id))
					: [],
		});
		setError('');
		setStoreSearch('');
		setShowForm(true);
	};

	const toggleStore = (storeId) => {
		setForm((current) => {
			const id = String(storeId);
			const exists = current.storeIds.includes(id);
			return {
				...current,
				storeIds: exists ? current.storeIds.filter((item) => item !== id) : [...current.storeIds, id],
			};
		});
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError('');

		const isEditing = Boolean(form.id);
		if (!form.name.trim()) {
			setError('Region name is required');
			return;
		}

		setSaving(true);
		try {
			const res = await fetch('/api/regions', {
				method: isEditing ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: form.id,
					name: form.name,
					description: form.description,
					storeIds: form.storeIds,
				}),
			});

			const json = await res.json().catch(() => ({}));
			if (!res.ok || !json?.success) {
				throw new Error(json?.message || 'Failed to save region');
			}

			const saved = json?.data?.region;
			if (!saved) {
				throw new Error('Region API response is invalid');
			}

			setRegions((current) => {
				if (isEditing) {
					return current.map((item) => (String(item.id) === String(saved.id) ? saved : item));
				}
				return [saved, ...current];
			});

			setShowForm(false);
			setForm(initialForm);
		} catch (err) {
			setError(err.message || 'Failed to save region');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget?.id) return;

		setSaving(true);
		try {
			const res = await fetch(`/api/regions?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
			const json = await res.json().catch(() => ({}));

			if (!res.ok || !json?.success) {
				throw new Error(json?.message || 'Failed to delete region');
			}

			setRegions((current) => current.filter((region) => String(region.id) !== String(deleteTarget.id)));
			setDeleteTarget(null);
		} catch (err) {
			setError(err.message || 'Failed to delete region');
		} finally {
			setSaving(false);
		}
	};

	return (
		<MainLayout>
			<div className="flex items-start justify-between gap-4 mb-6">
				<div>
					<nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
						<span className="text-blue-500">Settings</span>
						<span>›</span>
						<span className="text-gray-700 font-medium">Regions</span>
					</nav>
					<h1 className="text-3xl font-bold text-gray-900">Regions</h1>
					<p className="text-sm text-gray-500 mt-1">Create regions and assign stores to location groups. Need Help?</p>
				</div>

				<button
					type="button"
					onClick={openCreate}
					className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
				>
					<span className="text-lg leading-none">+</span>
					Create Region
				</button>
			</div>

			<div className="mb-4 flex items-center justify-between gap-3">
				<p className="text-xs text-gray-500">Region list and store mappings are loaded from the database.</p>
				<input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search regions"
					className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500"
				/>
			</div>

			<div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
				<div className="border-b border-gray-100 px-5 py-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="text-[15px] font-semibold text-gray-900">Region List</h2>
							<p className="text-xs text-gray-500 mt-1">Add, edit and delete regions with mapped stores.</p>
						</div>
						<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
							{filteredRegions.length} region{filteredRegions.length === 1 ? '' : 's'}
						</span>
					</div>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-gray-50 text-gray-600">
							<tr>
								<th className="px-5 py-3 font-semibold">Region Name</th>
								<th className="px-5 py-3 font-semibold">Description</th>
								<th className="px-5 py-3 font-semibold">Stores</th>
								<th className="px-5 py-3 font-semibold text-right">Actions</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<tr>
									<td colSpan={4} className="px-5 py-16 text-center text-gray-400">Loading regions...</td>
								</tr>
							) : filteredRegions.length === 0 ? (
								<tr>
									<td colSpan={4} className="px-5 py-16 text-center text-gray-400">No regions found.</td>
								</tr>
							) : filteredRegions.map((region) => (
								<tr key={region.id} className="border-t border-gray-100 align-top hover:bg-gray-50/70">
									<td className="px-5 py-4 font-medium text-gray-900">{region.name}</td>
									<td className="px-5 py-4 text-gray-700">{region.description || '—'}</td>
									<td className="px-5 py-4 text-gray-700">
										{region.storeCount || 0}
										{Array.isArray(region.stores) && region.stores.length > 0 && (
											<div className="mt-1 text-xs text-gray-500">{region.stores.map((store) => store.name).join(', ')}</div>
										)}
									</td>
									<td className="px-5 py-4">
										<div className="flex items-center justify-end gap-2">
											<button
												type="button"
												onClick={() => openEdit(region)}
												className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
											>
												Edit
											</button>
											<button
												type="button"
												onClick={() => setDeleteTarget(region)}
												className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
											>
												Delete
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{showForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
					<div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
						<div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
							<div>
								<h2 className="text-xl font-bold text-gray-900">
									{form.id ? 'Edit Region' : 'Create Region'}
								</h2>
								<p className="text-sm text-gray-500 mt-1">Basic information and mapped stores</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setShowForm(false);
									setForm(initialForm);
									setError('');
								}}
								className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
							>
								Close
							</button>
						</div>

						<form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
							<section className="rounded-xl border border-gray-200 p-5">
								<h3 className="mb-4 text-[15px] font-semibold text-blue-700">Basic Information</h3>

								<div className="space-y-4">
									<div>
										<label className="mb-1 block text-sm font-medium text-gray-700">Region Name</label>
										<input
											value={form.name}
											onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
											className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
											placeholder="Enter region name"
											required
										/>
									</div>

									<div>
										<label className="mb-1 block text-sm font-medium text-gray-700">Region Description</label>
										<textarea
											value={form.description}
											onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
											className="min-h-[88px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
											placeholder="Description"
										/>
									</div>
								</div>
							</section>

							<section className="rounded-xl border border-gray-200 p-5">
								<div className="mb-4 flex items-center justify-between gap-3">
									<h3 className="text-[15px] font-semibold text-blue-700">Stores List</h3>
									<input
										value={storeSearch}
										onChange={(event) => setStoreSearch(event.target.value)}
										placeholder="Search store"
										className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-500"
									/>
								</div>

								<p className="text-xs text-gray-500 mb-3">Select stores to assign to this region.</p>

								<div className="max-h-[280px] overflow-auto rounded-lg border border-gray-200">
									<table className="w-full text-left text-sm">
										<thead className="sticky top-0 bg-gray-50 text-gray-600">
											<tr>
												<th className="px-3 py-2 w-12">
													<span className="sr-only">Select</span>
												</th>
												<th className="px-3 py-2 font-semibold">Store ID</th>
												<th className="px-3 py-2 font-semibold">Store Name</th>
											</tr>
										</thead>
										<tbody>
											{filteredStores.length === 0 ? (
												<tr>
													<td colSpan={3} className="px-3 py-8 text-center text-gray-400">No stores found.</td>
												</tr>
											) : filteredStores.map((store) => {
												const checked = form.storeIds.includes(String(store.id));
												return (
													<tr key={store.id} className="border-t border-gray-100 hover:bg-gray-50/70">
														<td className="px-3 py-2">
															<input
																type="checkbox"
																checked={checked}
																onChange={() => toggleStore(store.id)}
																className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
															/>
														</td>
														<td className="px-3 py-2 text-gray-700">{store.id}</td>
														<td className="px-3 py-2 text-gray-700">{store.name}</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							</section>

							{error && <p className="text-sm text-red-600">{error}</p>}

							<div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
								<button
									type="button"
									onClick={() => {
										setShowForm(false);
										setForm(initialForm);
										setError('');
									}}
									className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={saving}
									className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
								>
									{saving ? 'Saving...' : form.id ? 'Update Region' : 'Save Region'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{deleteTarget && (
				<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8">
					<div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
						<div className="border-b border-gray-100 px-6 py-5">
							<h3 className="text-lg font-bold text-gray-900">Delete Region?</h3>
							<p className="mt-1 text-sm text-gray-500">This will remove {deleteTarget.name} and unmap all its stores.</p>
						</div>
						<div className="flex items-center justify-end gap-2 px-6 py-5">
							<button
								type="button"
								onClick={() => setDeleteTarget(null)}
								className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleDelete}
								disabled={saving}
								className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
							>
								{saving ? 'Deleting...' : 'Delete'}
							</button>
						</div>
					</div>
				</div>
			)}
		</MainLayout>
	);
}
