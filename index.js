moment.locale("fr");


const apiConfig = {
	apiKey: "AIzaSyANHzPbzsJuQt-VgRpAg-1epbFikCITWTc",
	clientId: "658460649427-4o56l086hqt4tb3qe3t75j23o3dof0he.apps.googleusercontent.com",
	discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
	scope: "https://www.googleapis.com/auth/spreadsheets"
};


Vue.component('input-span', {
	props: ["day", "time", "click_mode", "name"],
	template: `
		<span v-if="(time in day.bookings) && !edit_mode" @dblclick="to_edit_mode">{{ day.bookings[this.time] }}</span>
		<button v-else-if="!(time in day.bookings) && !edit_mode && click_mode" @click="send_changes_click" class="btn btn-outline-secondary cell">
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
				$(this.$refs.input).val(this.day.bookings[this.time]);
				$(this.$refs.input).select();
			});
		},
		send_changes_next(event) {
			let day_inputs = $(`#day-${this.day.day.date()} input`);
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
			if (moment().diff(this.last_sent) > 500) {
				this.$emit("send_changes", name || "", this.day, this.time);
				this.last_sent = moment();
				this.edit_mode = false;
			}
		}
	}
});


var app = new Vue({
	el: "#vue-app",
	data: {
		is_signed_in: false,
		is_signing_in: true,
		is_month_loaded: false,
		username: "",
		click_mode: "",
		sheet_ids: {
			ce: "1i2pVPcG7Qm3Zxn5lSta-uR0-LXXurSZhcc8xhsoF7zA",
			mxd: "1ANoEagiR88K3e0WVh0lP9sk8inODCuPya9MUNwInpk8",
		},
		sheet_tag: "ce",
		times: [],
		today: {
			day: moment(),
			month: {},
			bookings: {},
		},
		tomorrow: {
			day: moment().add(1, "day"),
			month: {},
			bookings: {}
		}
	},
	computed: {
		sheet_api: function () {
			return gapi.client.sheets.spreadsheets;
		},
		sheet_id: function () {
			return this.sheet_ids[this.sheet_tag];
		},
		days: function () {
			return [this.today, this.tomorrow];
		}
	},
	watch: {
		username: function() {
			localStorage.setItem("username", this.username);
		},
		click_mode: function() {
			localStorage.setItem("click_mode", JSON.stringify(this.click_mode));
		}
	},
	methods: {
		get_days_range: function (day_1_info, nb_days = 1) {
			let month_name = day_1_info.month.title;
			let row_start = day_1_info.month.row;
			let row_end = day_1_info.month.row + day_1_info.month.times.length;
			let col_start = day_1_info.month.col + day_1_info.day.date() - 1;
			let col_end = col_start + nb_days - 1;
			return `${month_name}!${rowcol_to_a1(row_start, col_start)}:${rowcol_to_a1(row_end, col_end)}`;
		},
		change_room: function (tag) {
			this.sheet_tag = tag;
			this.init();
		},
		init: async function () {
			this.is_month_loaded = false;

			this.username = localStorage.getItem("username") || "";
			this.click_mode = JSON.parse(localStorage.getItem("click_mode"));

			let promises = this.days.map(async (day_info) => {
				let month_stored_name = day_info.day.month() + '-' + day_info.day.year() + "-" + this.sheet_tag;
				day_info.month = await (JSON.parse(localStorage.getItem(month_stored_name)) || this.load_month(day_info.day));
				return day_info.month;
			});

			[month_0, month_1] = await Promise.all(promises)
			this.times = month_0.times; // TODO

			this.is_month_loaded = true;
			this.update_days();
		},
		load_month: function (day) {

			let find_day_in_sheets = async (day_repr, sheets, index) => {
				if (index >= sheets.length) {
					$.notify({
						title: 'Error loading sheet:<br />',
						message: "Sheet of current month does not exist"
					}, {
						type: 'danger',
						delay: 3000
					});
					return;
				}

				var params = {
					spreadsheetId: this.sheet_id,
					range: `${sheets[index].properties.title}!A1:AH40`,
					valueRenderOption: "FORMATTED_VALUE",
					majorDimension: "COLUMNS"
				};

				let request = this.sheet_api.values.get(params);
				let values = (await request).result.values;
				let [idx_first_row, idx_first_col] = find_2d(values, day_repr);

				if (idx_first_row < 0) {
					return find_day_in_sheets(day_repr, sheets, index + 1);
				}

				// GET TIME COLUMN

				let [idx_time_row, idx_time_col] = find_2d(values, "Heure");
				let time_col = values[idx_time_col];
				let times = time_col.slice(idx_time_row + 1);

				let month_info = {
					times: times,
					row: idx_first_row + 1,
					col: idx_first_col,
					title: sheets[index].properties.title
				};

				// SAVE TO LOCAL STORAGE

				localStorage.setItem(
					day.month() + '-' + day.year() + "-" + this.sheet_tag,
					JSON.stringify(month_info)
				);

				return month_info;
			};

			return gapi.client.sheets.spreadsheets.get({ spreadsheetId: this.sheet_id }).then(spreadsheetInfo => {
				let first_day_month_repr = day.clone().startOf("month").format("DD.MM.YYYY");
				let sheets = spreadsheetInfo.result.sheets;
				return find_day_in_sheets(first_day_month_repr, sheets, 0);
			});
		},
		update_days: async function () {
			if (!this.is_month_loaded) {
				console.warn("Update not performed : App not initialised");
				return;
			}

			if (this.today.day.month() === this.tomorrow.day.month()) {
				// GET IN SAME SHEET

				let range_today = this.get_days_range(this.today, 2);

				var params = {
					spreadsheetId: this.sheet_id,
					range: range_today,
					valueRenderOption: 'FORMATTED_VALUE',
					majorDimension: 'COLUMNS'
				};
				var request = this.sheet_api.values.get(params);

				request = request.then(response => {
					return response.result.values;
				});

			} else {
				// GET IN DIFFERENT SHEETS

				let range_today = this.get_days_range(this.today);
				let range_tomorrow = this.get_days_range(this.tomorrow);

				var params = {
					spreadsheetId: this.sheet_id,
					ranges: [range_today, range_tomorrow],
					valueRenderOption: 'FORMATTED_VALUE',
					majorDimension: 'COLUMNS'
				};
				var request = this.sheet_api.values.batchGet(params);

				request = request.then(response => {
					return response.result.valueRanges.map(range => range.values[0]);
				});
			}

			let [today_bookings, tomorrow_bookings] = await request;

			let new_bookings = {};
			today_bookings && today_bookings.forEach((booking, i) => {
				if (booking != "" && booking != "\n")
					new_bookings[this.today.month.times[i]] = booking;
			});
			this.today.bookings = new_bookings;

			new_bookings = {};
			tomorrow_bookings && tomorrow_bookings.forEach((booking, i) => {
				if (booking != "" && booking != "\n")
					new_bookings[this.tomorrow.month.times[i]] = booking;
			});
			this.tomorrow.bookings = new_bookings;
		},
		send_booking: function (value, day, time) {
			if (this.is_signed_in === false) {
				$.notify({
					title: 'Error updating sheet:<br />',
					message: "You are not signed in"
				}, {
					type: 'danger',
					delay: 3000
				});
				return;
			}

			let row = this.times.indexOf(time) + day.month.row;
			let col = day.month.col + day.day.date() - 1;

			if (value)
				this.$set(day.bookings, time, value);
			else
				this.$delete(day.bookings, time);

			gapi.client.sheets.spreadsheets.values
				.update({
					spreadsheetId: this.sheet_id,
					range: `${day.month.title}!${rowcol_to_a1(row, col)}:${rowcol_to_a1(row + 1, col)}`,
					valueInputOption: "RAW",
					resource: {
						values: [
							[value]
						]
					}
				})
				.then(() => { }, (reason) => {
					$.notify({
						title: 'Error updating sheet:<br />',
						message: reason.result.error.message
					}, {
						type: 'danger',
						delay: 2000,
						timer: 500
					});

					this.update_days();
				});
		},
	},
	mounted: function () {
		gapi.load("client:auth2", {
			callback: async () => {
				await gapi.client.init(apiConfig);

				let on_auth = (is_signed_in) => {
					this.is_signing_in = false;
					this.is_signed_in = is_signed_in;
					if (is_signed_in)
						this.init();
				};

				let authInstance = gapi.auth2.getAuthInstance();
				authInstance.isSignedIn.listen(on_auth);
				on_auth(authInstance.isSignedIn.get());
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

document.onfocus = app.update_days;