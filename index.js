moment.locale("fr");


const apiConfig = {
	apiKey: "AIzaSyANHzPbzsJuQt-VgRpAg-1epbFikCITWTc",
	clientId: "658460649427-4o56l086hqt4tb3qe3t75j23o3dof0he.apps.googleusercontent.com",
	discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
	scope: "https://www.googleapis.com/auth/spreadsheets"
};


Vue.component('input-span', {
	props: ["day", "time"],
	template: `
		<span v-if="time in day.bookings" @dblclick="send_changes">{{ day.bookings[time] }}</span>
		<input v-else @keypress.enter='send_changes_next' @blur='send_changes' ref="input" type="text" class="form-control p-0 text-center bg-transparent" />
  	`, data: () => {
		return {
			last_sent: moment()
		}
	},
	methods: {
		send_changes_next(event) {
			let day_inputs = $(`#day-${this.day.day.date()} input`);
			let idx = day_inputs.index($(this.$refs.input));
			day_inputs.eq(idx + 1).focus();
			this.send_changes(event);
		},
		send_changes(event) {
			if (moment().diff(this.last_sent) > 500) {
				this.$emit("send_changes", event.target.value || "", this.day, this.time);
				this.last_sent = moment();
			}
		}
	}
});


var app = new Vue({
	el: "#vue-app",
	data: {
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
	methods: {
		get_month_name: function (day) {
			return this.sheet_tag == "ce" ? " Février 2020" : "Fevrier 2020";
			return capitalize(day.format(" MMMM YYYY")); // TODO:
		},
		change_room: function (tag) {
			this.sheet_tag = tag;
			this.init();
		},
		init: function () {
			let promises = this.days.map((day_info) => {
				let month_stored_name = this.get_month_name(day_info.day) + " - " + this.sheet_tag;
				let month = JSON.parse(localStorage.getItem(month_stored_name));

				if (month === null) {
					return this.load_month(day_info.day).then((month) => {
						day_info.month = month
						return month;
					});
				}

				day_info.month = month;
				return month;
			});

			Promise.all(promises)
				.then(([month_0, month_1]) => {
					this.times = month_0.times; // TODO
				})
				.then(this.update_days);

		},
		load_month: function (day) {
			let month_name = this.get_month_name(day);

			var params = {
				spreadsheetId: this.sheet_id,
				range: `${month_name}!A1:AH40`,
				valueRenderOption: "FORMATTED_VALUE",
				majorDimension: "COLUMNS"
			};

			var request = this.sheet_api.values.get(params);

			return request.then(response => {
				let values = response.result.values;

				// GET TIME COLUMN

				let [idx_time_row, idx_time_col] = find_2d(values, "Heure");
				let time_col = values[idx_time_col];
				let times = time_col.slice(idx_time_row + 1);

				// GET FIRST DAY ROW AND COL INDEX

				let first_day_month_repr = day.clone().startOf("month").format("DD.MM.YYYY");
				let [idx_first_row, idx_first_col] = find_2d(
					values,
					first_day_month_repr
				);

				let month_info = {
					times: times,
					row: idx_first_row + 1,
					col: idx_first_col
				};

				// SAVE TO LOCAL STORAGE

				localStorage.setItem(
					month_name + " - " + this.sheet_tag,
					JSON.stringify(month_info)
				);

				return month_info;
			});
		},
		update_days: function () {
			if (this.today.day.month === this.tomorrow.day.month) {
				// GET IN SAME SHEET
				let month_name = this.get_month_name(this.today.day);

				let row_start = this.today.month.row;
				let row_end = this.today.month.row + this.today.month.times.length;
				let col_start = this.today.month.col + this.today.day.date() - 1;
				let col_end = col_start + 1;

				var params = {
					spreadsheetId: this.sheet_id,
					range: `${month_name}!${rowcol_to_a1(row_start, col_start)}:${rowcol_to_a1(row_end, col_end)}`,
					valueRenderOption: 'FORMATTED_VALUE',
					majorDimension: 'COLUMNS'
				};
				var request = this.sheet_api.values.get(params);

				request = request.then(response => {
					return response.result.values;
				});

			} else {
				// GET IN DIFFERENT SHEET
			}

			request.then(([today_bookings, tomorrow_bookings]) => {
				let new_bookings = {};
				today_bookings && today_bookings.forEach((booking, i) => {
					if (booking != "")
						new_bookings[this.today.month.times[i]] = booking;
				});
				this.today.bookings = new_bookings;

				new_bookings = {};
				tomorrow_bookings && tomorrow_bookings.forEach((booking, i) => {
					if (booking != "")
						new_bookings[this.tomorrow.month.times[i]] = booking;
				});
				this.tomorrow.bookings = new_bookings;

			})

			// var params = {
			//     spreadsheetId: sheet_id,
			//     ranges: ["A1:A50", `${month_name}!${rowcol_to_a1(row, col)}:${rowcol_to_a1(row + nb_timeslot + 1, col)}`],
			//     valueRenderOption: 'FORMATTED_VALUE',
			//     majorDimension: 'COLUMNS'
			// };

			// var request = this.sheet_api.values.batchGet(params);
			// request.then(response => {
			//     console.log(response.result);
			// });
		},
		send_booking: function (value, day, time) {
			let row = this.times.indexOf(time) + day.month.row;
			let col = day.month.col + day.day.date() - 1;

			gapi.client.sheets.spreadsheets.values
				.update({
					spreadsheetId: this.sheet_id,
					range: `${rowcol_to_a1(row, col)}:${rowcol_to_a1(row + 1, col)}`,
					valueInputOption: "RAW",
					resource: {
						values: [
							[value]
						]
					}
				})
				.then(() => {
					if (value)
						this.$set(day.bookings, time, value);
					else
						this.$delete(day.bookings, time);
				}, (reason) => {
					$.notify({
						title: 'Error updating sheet:<br />',
						message: reason.result.error.message
					}, {
						type: 'danger',
						delay: 2000,
						timer: 500
					});
				});
		},
	},
	mounted: function () {
		gapi.load("client:auth2", {
			callback: () => {
				gapi.client.init(apiConfig).then(() => {
						let authInstance = gapi.auth2.getAuthInstance();
						authInstance.isSignedIn.listen(this.init);

						if (authInstance.isSignedIn.get())
							this.init();
						else {
							authInstance.signIn().catch(function (error) {
								$.notify({
									title: 'Error authenticating:<br />',
									message: error.error + "<br />Please click " +
										'<button class="m-1 btn btn-danger" onclick="gapi.auth2.getAuthInstance().signIn()">SIGN IN</button>'
								}, {
									delay: 0,
									type: 'danger',
								});
							});
							// authInstance.signIn({ ux_mode: "redirect"}).catch(function (error) { console.log(error); });
						}
				});
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