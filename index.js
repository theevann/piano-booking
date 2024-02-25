moment.locale("fr");


const apiConfig = {
	apiKey: "AIzaSyANHzPbzsJuQt-VgRpAg-1epbFikCITWTc",
	clientId: "658460649427-4o56l086hqt4tb3qe3t75j23o3dof0he.apps.googleusercontent.com",
	discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
	scope: "https://www.googleapis.com/auth/spreadsheets"
};


Vue.component('input-span', {
	props: ["view", "day_room", "time", "click_mode", "name"],
	template: `
		<span v-if="!(time in day_room.bookings)"></span>
		<span v-else-if="!edit_mode && day_room.bookings[time] != ''" @dblclick="to_edit_mode" :class="day_room.bookings[time].trim() == name.trim() ? 'font-weight-bold cell' : ''">{{ day_room.bookings[time] }}</span>
		<button v-else-if="!edit_mode && day_room.bookings[time] == '' && click_mode" @click="send_changes_click" class="btn btn-outline-secondary cell">
			<i class="fas fa-pen"></i>
		</button>
		<input v-else @keypress.enter='send_changes_next' @blur='send_changes_event' ref="input" type="text" class="form-control p-0 text-center bg-transparent cell" />
	`,
	data: function () {
		return {
			last_sent: moment(),
			edit_mode: false
		}
	},
	methods: {
		to_edit_mode() {
			this.edit_mode = true;
			this.$nextTick(() => {
				$(this.$refs.input).val(this.day_room.bookings[this.time]);
				$(this.$refs.input).select();
			});
		},
		send_changes_next(event) {
			let className = this.view == 0 ? `.room-${this.day_room.room.name}` : `.day-${this.day_room.day.moment.date()}`;
			let day_inputs = $(`${className} input`);
			let idx = day_inputs.index($(this.$refs.input));
			day_inputs.eq(idx + 1).focus();
			this.send_changes_event(event);
		},
		send_changes_event(event) {
			this.send_changes(event.target.value);
		},
		send_changes_click() {
			this.send_changes(this.name);
		},
		send_changes(name) {
			if (moment().diff(this.last_sent) > 500) { // When hitting enter and blurring : sending twice
				this.$emit("send_changes", name || "", this.day_room, this.time);
				this.last_sent = moment();
				this.edit_mode = false;
			}
		}
	}
});


var app = new Vue({
	el: "#vue-app",
	data: {
		is_loaded: false,
		last_updated: moment(),
		count: 0,
		user_name: "",
		click_mode: false,
		day: 0,
		room: 0,
		view: 0,
		days: [
			{
				name: "Today",
				moment: moment()
			},
			{
				name: "Tomorrow",
				moment: moment().add(1, "day")
			}
		],
		rooms: [
			{
				name: "CE",
				sheet_id: "1i2pVPcG7Qm3Zxn5lSta-uR0-LXXurSZhcc8xhsoF7zA",
			},
			{
				name: "MXD",
				sheet_id: "1ANoEagiR88K3e0WVh0lP9sk8inODCuPya9MUNwInpk8",
			}
		],
		month_sheet_infos: {},
		day_room_infos: {},
		views: [
			{
				name: "day",
				buttons: "days",
				headers: "rooms",
				get_cols: function () {
					if (!this.is_loaded)
						return []

					let day = this.days[this.day];
					return this.rooms.map(room => {
						let key = this.get_key_day_room(day.moment, room.name);
						return this.day_room_infos[key];
					});
				}
			},
			{
				name: "room",
				buttons: "rooms",
				headers: "days",
				get_cols: function () {
					if (!this.is_loaded)
						return []

					let room = this.rooms[this.room];
					return this.days.map(day => {
						let key = this.get_key_day_room(day.moment, room.name);
						return this.day_room_infos[key];
					});
				}
			}
		]
	},
	computed: {
		sheet_api: function () {
			return gapi.client.sheets.spreadsheets;
		},
		current_buttons: function () {
			return this.views[this.view].buttons;
		},
		current_headers: function () {
			return this.views[this.view].headers;
		},
		current_times: function () {
			let day_room_infos = this.current_day_room_infos;
			let all_times = day_room_infos.map(info => info.sheet_info.times);
			let times = [...new Set([].concat.apply([], all_times))].sort();
			return times;
		},
		current_day_room_infos: function () {
			return this.views[this.view].get_cols.call(this);
		},
		current_idx: function () {
			return this[this.views[this.view].name];
		}
	},
	watch: {
		user_name: function () {
			localStorage.setItem("user_name", this.user_name);
		},
		click_mode: function () {
			localStorage.setItem("click_mode", JSON.stringify(this.click_mode));
		},
		view: function () {
			localStorage.setItem("view", this.view);
			this.get_bookings();
		},
		day: function () {
			localStorage.setItem("day", this.day);
			this.get_bookings();
		},
		room: function () {
			localStorage.setItem("room", this.room);
			this.get_bookings();
		},
	},
	methods: {
		collapse_options: function () {
			$('#collapseOptions').collapse('hide');
		},
		get_key_month: function (day, room) {
			return day.month() + '-' + day.year() + "-" + room;
		},
		get_key_day_room: function (day, room) {
			return day.date() + '-' + day.month() + '-' + day.year() + "-" + room;
		},
		get_day_range: function (day_room) {
			let month_name = day_room.sheet_info.title;
			let row_start = day_room.sheet_info.row;
			let row_end = day_room.sheet_info.row + day_room.sheet_info.times.length;
			let col_start = day_room.sheet_info.col + day_room.day.moment.date() - 1;
			let col_end = col_start;
			return `${month_name}!${rowcol_to_a1(row_start, col_start)}:${rowcol_to_a1(row_end, col_end)}`;
		},
		change_tab: function (idx) {
			this[this.views[this.view].name] = idx;
		},
		init: async function () {
			await this.init_day_room_info();
			await this.get_bookings();
		},
		init_day_room_info: async function () {
			for (room of this.rooms) {
				for (day of this.days) {
					let key_sheet = this.get_key_month(day.moment, room.name);
					let sheet_info = await (JSON.parse(localStorage.getItem(key_sheet)) || this.get_sheet_of(day, room));
					this.$set(this.month_sheet_infos, key_sheet, sheet_info);

					let key_day_room = this.get_key_day_room(day.moment, room.name);
					this.$set(this.day_room_infos, key_day_room, {
						day: day,
						room: room,
						sheet_info: sheet_info,
						bookings: {}
					});
				}
			}
			this.is_loaded = true;
		},
		get_sheet_of: async function (day, room) {
			let day_repr = day.moment.clone().startOf("month").format("DD.MM.YYYY");

			let spreadsheetInfo = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: room.sheet_id });
			let sheets = spreadsheetInfo.result.sheets;

			for (const sheet of sheets) {
				var params = {
					spreadsheetId: room.sheet_id,
					range: `${sheet.properties.title}!A1:AH50`,
					valueRenderOption: "FORMATTED_VALUE",
					majorDimension: "COLUMNS"
				};

				let request = this.sheet_api.values.get(params);
				let values = (await request).result.values;
				if (values === undefined)
					continue;
				
				let [idx_first_row, idx_first_col] = find_2d(values, day_repr);
				if (idx_first_row < 0)
					continue;

				// GET TIME COLUMN

				let [idx_time_row, idx_time_col] = find_2d(values, "Heure");
				let time_col = values[idx_time_col];
				let times = time_col.slice(idx_time_row + 1);

				let sheet_info = {
					times: times,
					row: idx_first_row + 1,
					col: idx_first_col,
					title: sheet.properties.title
				};

				// SAVE TO LOCAL STORAGE

				localStorage.setItem(
					this.get_key_month(day.moment, room.name),
					JSON.stringify(sheet_info)
				);

				return sheet_info;
			}

			$.notify({
				title: 'Error loading sheet:<br />',
				message: "Sheet of current month does not exist"
			}, {
				type: 'danger',
				delay: 3000
			});
			return;
		},
		get_bookings: async function () {
			if (await this.get_bookings_of(this.current_day_room_infos)) {
				this.last_updated = moment();
			}
		},
		get_bookings_of: async function (day_room_infos) {
			if (!this.is_loaded) {
				console.warn("Update not performed : App not initialised");
				return false;
			}

			let day_room_groups = {};
			for (day_room of day_room_infos) {
				(day_room_groups[day_room.room.sheet_id] = day_room_groups[day_room.room.sheet_id] || []).push(day_room);
			}

			for (sheet_id in day_room_groups) {
				let day_room_group = day_room_groups[sheet_id];
				let ranges = day_room_group.map(this.get_day_range);

				var params = {
					spreadsheetId: sheet_id,
					ranges: ranges,
					valueRenderOption: 'FORMATTED_VALUE',
					majorDimension: 'COLUMNS'
				};

				try {
					var response = await this.sheet_api.values.batchGet(params);
				} catch(e) {
					if ([401, 403].includes(e.result.error.code)) {
						await gapi.auth.authorize({
							'client_id': apiConfig.client_id,
							'scope': apiConfig.scope,
							'immediate': true
						});
						var response = await this.sheet_api.values.batchGet(params);
					} else {
						console.error(e.result.error.message);
						$.notify({
							title: 'Error loading bookings:<br />',
							message: e.result.error.message
						}, {
							type: 'danger',
							delay: 3000
						});
						return false;
					}
				}
				var bookings_group = response.result.valueRanges.map(range => (range.values && range.values[0]) || []);

				for ([bookings, day_room_info] of zip(bookings_group, day_room_group)) {
					let new_bookings = {};

					for ([idx, time] of day_room_info.sheet_info.times.entries()) {
						let booking = (idx >= bookings.length) ? "" : bookings[idx].replace(/(^\s+|\s+$|\n)/g, "");
						new_bookings[time] = booking;
					}

					this.$set(day_room_info, "bookings", new_bookings);
				}
			}
			return true;
		},
		send_booking: function (value, day_room, time) {

			let row = day_room.sheet_info.times.indexOf(time) + day_room.sheet_info.row;
			let col = day_room.sheet_info.col + day_room.day.moment.date() - 1;
			const range = `${day_room.sheet_info.title}!${rowcol_to_a1(row, col)}:${rowcol_to_a1(row + 1, col)}`;

			this.$set(day_room.bookings, time, value);

			fetch(`https://n8n.courdier.org/webhook/piano-booking-updater?value=${value}&ranges=${range}&room=${day_room.room.name}`)
				.then(response => {
					if (!response.ok) {
						throw new Error('Network response was not ok');
					}
					return response.json();
				})
				.then(data => {
					console.log(data);
				})
				.catch(error => {
					$.notify({
						title: 'Error updating sheet:<br />',
						message: error
					}, {
						type: 'danger',
						delay: 3000
					});

					this.get_bookings();
				});


			// gapi.client.sheets.spreadsheets.values
			// 	.update({
			// 		spreadsheetId: day_room.room.sheet_id,
			// 		range: `${day_room.sheet_info.title}!${rowcol_to_a1(row, col)}:${rowcol_to_a1(row + 1, col)}`,
			// 		valueInputOption: "RAW",
			// 		resource: {
			// 			values: [
			// 				[value + "  "]
			// 			]
			// 		}
			// 	})
			// 	.then(() => { }, (reason) => {
			// 		$.notify({
			// 			title: 'Error updating sheet:<br />',
			// 			message: reason.result.error.message
			// 		}, {
			// 			type: 'danger',
			// 			delay: 2000,
			// 			timer: 500
			// 		});

			// 		this.get_bookings();
			// });
		}
	},
	mounted: function () {
		this.room = localStorage.getItem("room") || 0;
		this.day = localStorage.getItem("day") || 0;
		this.view = localStorage.getItem("view") || 0;
		this.user_name = localStorage.getItem("user_name") || "";
		this.click_mode = JSON.parse(localStorage.getItem("click_mode")) || false;

		for (view of this.views) {
			view.buttons = this[view.buttons].map(el => el.name);
			view.headers = this[view.headers].map(el => el.name);
		}

		gapi.load('client', {
			callback: async () => {
				await gapi.client.init(apiConfig);
				this.init();
			},
			onerror: function () {
				console.warn('gapi.client failed to load!');
			},
		});

	}  // End mounted
});

function rowcol_to_a1(row, col) {
	const A = 65;
	let column_label = "";
	let div = col + 1;

	while (div !== 0) {
		div -= 1;
		let mod = div % 26;
		div = ~~(div / 26);
		column_label = String.fromCharCode(A + mod) + column_label;
	}

	return `${column_label}${row + 1}`;
}

function zip(arr1, arr2) {
	return arr1.map((k, i) => [k, arr2[i]]);
};

function capitalize(s) {
	return s[0].toUpperCase() + s.slice(1);
}

function find_2d(array, value) {
	let idx_row, idx_col;
	idx_col = array.findIndex(col_values => {
		idx_row = col_values.indexOf(value);
		return idx_row !== -1;
	});
	return [idx_row, idx_col];
}

document.onfocus = app.get_bookings;
